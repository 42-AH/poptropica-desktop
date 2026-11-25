using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
namespace PoptropicaDesktop
{
    internal static class UpdatePreference
    {
        internal static bool? Read(string profile)
        {
            try
            {
                string value = File.ReadAllText(Path.Combine(profile, "automatic-updates")).Trim();
                if (value == "on") return true;
                if (value == "off") return false;
            }
            catch (IOException) {}
            catch (UnauthorizedAccessException) {}
            return null;
        }
        internal static void Set(string profile, bool enabled)
        {
            Directory.CreateDirectory(profile);
            BundledUpdater.AtomicWrite(Path.Combine(profile, "automatic-updates"), enabled ? "on" : "off");
        }
    }
    internal sealed class UpdatePlan
    {
        internal PlayerRelease Player;
        internal string Unavailable;
        internal bool HasIslands { get { return Changed!=0 || Removed!=0; } }
        internal byte[] Manifest;
        internal Dictionary<string, AssetEntry> Remote;
        internal Dictionary<string, AssetEntry> Current;
        internal string CurrentRoot;
        internal int Changed;
        internal int Removed;
        internal long DownloadBytes;
    }
    internal static class BundledUpdater
    {
        private const int MaxCatalog = 32 * 1024 * 1024;
        private const long MaxFile = 768L * 1024 * 1024;
        private const long MaxInstall = 24L * 1024 * 1024 * 1024;
        private static readonly SemaphoreSlim gate = new SemaphoreSlim(1,1);
        private static readonly Uri website = new Uri("https://poptropica.love/");
        private static string pendingRoot;
        private static string pendingHash;
        private static Dictionary<string, AssetEntry> pendingCatalog;
        internal static bool PendingRestart { get { return pendingRoot != null || PlayerUpdates.Pending; } }
        internal static async Task CheckForUpdates(Form owner)
        {
            if (!await gate.WaitAsync(0))
            {
                await GameStyle.Ask(owner,"Checking for updates","A check is already in progress.","OK");
                return;
            }
            string failure=null;
            try
            {
                using (var client = Client())
                {
                    UpdatePlan plan = null;
                    await WithProgress(owner, "Checking for updates", async (status, token) => {
                        plan = await Plan(client, token);
                    });
                    if (!plan.HasIslands && plan.Player==null)
                    {
                        await GameStyle.Ask(owner,plan.Unavailable==null ? "All caught up" : "Check incomplete", plan.Unavailable ?? (PendingRestart ? "Your updates will be ready next launch." : "Your player and islands are up to date."),"OK");
                        return;
                    }
                    string details = plan.Player==null ? "" : "Player "+plan.Player.Version.ToString(3)+"\n";
                    if(plan.HasIslands)details+=String.Format(CultureInfo.CurrentCulture,"Island files · {0:N0} changed, {1:N0} removed\n",plan.Changed,plan.Removed);
                    details+="Download "+FormatBytes(plan.DownloadBytes+(plan.Player==null?0:plan.Player.Size))+". Your saves stay on this PC.";
                    if(plan.Unavailable!=null)details+="\n"+plan.Unavailable;
                    if (!await GameStyle.Ask(owner,"Update available",details,"Update","Later")) return;
                    await WithProgress(owner,"Downloading updates",(status,token) => InstallAll(plan,client,status,token));
                    await GameStyle.Ask(owner,"Update ready","Your updates will be ready the next time you open Poptropica.","Done");
                }
            }
            catch (OperationCanceledException) {}
            catch (Exception e)
            {
                failure=FailureText(e);
            }
            finally { gate.Release(); }
            if(failure!=null && !owner.IsDisposed)await GameStyle.Ask(owner,"Couldn't update",failure,"OK");
        }
        internal static async Task Automatic(Action<string> notice,CancellationToken token)
        {
            if (!await gate.WaitAsync(0)) return;
            try
            {
                using(var client = Client())
                {
                    var plan = await Plan(client,token);
                    if (!plan.HasIslands && plan.Player==null) { if(plan.Unavailable!=null)notice("Update check incomplete"); return; }
                    notice("Downloading updates...");
                    await InstallAll(plan,client,null,token);
                    notice("Update ready · restart to play");
                }
            }
            catch (OperationCanceledException) { notice(""); }
            catch (Exception) { notice(PendingRestart ? "Update ready · restart to play" : "Update unavailable"); }
            finally { gate.Release(); }
        }
        private static string FailureText(Exception e)
        {
            if (e is HttpRequestException || e is WebException) return "Couldn't reach the update server. Check your connection and try again.";
            if (e is InvalidDataException) return "The new files didn't pass verification. Your installed islands are still available.";
            if (e is IOException || e is UnauthorizedAccessException) return "Couldn't save the update. Check the free space on this PC and try again.";
            return "The update couldn't finish. You can keep playing your installed islands.";
        }
        private static async Task WithProgress(Form owner,string title,Func<IProgress<string>,CancellationToken,Task> work)
        {
            using (var cancel = new CancellationTokenSource())
            using (var dialog = new GameDialog(title,"Connecting to poptropica.love…"))
            {
                var stop = dialog.AddAction("Cancel",DialogResult.None,false);
                stop.Click += delegate { cancel.Cancel(); stop.Enabled=false; dialog.Body="Canceling…"; };
                EventHandler closed=delegate { cancel.Cancel(); };
                owner.Disposed+=closed;
                var overlay=dialog.Present(owner);
                Exception failure=null;
                try
                {
                    await work(new Progress<string>(s => {
                        if(!dialog.IsDisposed && !cancel.IsCancellationRequested)dialog.Body=s;
                    }),cancel.Token);
                }
                catch(Exception e){failure=e;}
                finally
                {
                    owner.Disposed-=closed;
                    dialog.Dismiss(DialogResult.OK);
                }
                await overlay;
                if(failure!=null)throw failure;
            }
        }
        private static HttpClient Client()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            var handler = new HttpClientHandler {AllowAutoRedirect=false,AutomaticDecompression=DecompressionMethods.GZip | DecompressionMethods.Deflate,UseCookies=false};
            var client = new HttpClient(handler);
            client.Timeout = TimeSpan.FromSeconds(45);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("PoptropicaDesktop/1.0");
            return client;
        }
        private static async Task InstallAll(UpdatePlan plan,HttpClient client,IProgress<string> progress,CancellationToken token)
        {
            if(plan.Player!=null)
            {
                if(progress!=null)progress.Report("Downloading player "+plan.Player.Version.ToString(3));
                await PlayerUpdates.Install(client,plan.Player,token);
            }
            if(plan.HasIslands)await InstallPlan(plan,client,progress,token);
        }
        private static async Task<UpdatePlan> Plan(HttpClient client,CancellationToken token)
        {
            var islands=IslandPlan(client,token);
            PlayerRelease player=null;
            string unavailable=null;
            try { player=await PlayerUpdates.Check(client,token); }
            catch(Exception) { token.ThrowIfCancellationRequested(); unavailable="Couldn't verify player updates."; }
            UpdatePlan result;
            try { result=await islands; }
            catch(Exception) { token.ThrowIfCancellationRequested(); if(unavailable!=null)throw; result=new UpdatePlan(); unavailable="Couldn't verify island updates."; }
            result.Player=player;
            result.Unavailable=unavailable;
            return result;
        }
        private static async Task<UpdatePlan> IslandPlan(HttpClient client, CancellationToken token)
        {
            string installed = pendingHash ?? await Task.Run(() => BundledAssets.CatalogHash, token);
            byte[] manifest = await FetchCatalog(client, installed, token);
            if (manifest == null) return new UpdatePlan();
            return await Task.Run(() => MakePlan(manifest, BundledAssets.Baseline, pendingCatalog ?? BundledAssets.Catalog, pendingRoot ?? BundledAssets.ActiveRoot), token);
        }
        internal static async Task<byte[]> FetchCatalog(HttpClient client, string installedHash, CancellationToken token)
        {
            using (var request = new HttpRequestMessage(HttpMethod.Get, new Uri(website, "api/desktop-assets.php")))
            using (var deadline = CancellationTokenSource.CreateLinkedTokenSource(token))
            {
                deadline.CancelAfter(TimeSpan.FromMinutes(2));
                if (!String.IsNullOrEmpty(installedHash))
                    request.Headers.IfNoneMatch.Add(new EntityTagHeaderValue("\"" + installedHash + "\""));
                try
                {
                    using (var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token).ConfigureAwait(false))
                    {
                        var etag = response.Headers.ETag;
                        if (response.StatusCode == HttpStatusCode.NotModified)
                        {
                            if (String.IsNullOrEmpty(installedHash) || (etag != null && !CatalogTagMatches(etag, installedHash)))
                                throw new InvalidDataException("Unexpected catalog validator.");
                            return null;
                        }
                        response.EnsureSuccessStatusCode();
                        if (response.StatusCode != HttpStatusCode.OK || response.Content == null || response.Content.Headers.ContentLength > MaxCatalog)
                            throw new InvalidDataException("Invalid catalog response.");
                        using (deadline.Token.Register(response.Dispose))
                        using (var storage = new MemoryStream())
                        using (var stream = await response.Content.ReadAsStreamAsync().ConfigureAwait(false))
                        {
                            await Transfer(stream, storage, MaxCatalog, deadline.Token).ConfigureAwait(false);
                            byte[] bytes = storage.ToArray();
                            string hash = BundledAssets.HashBytes(bytes);
                            if (etag != null && !CatalogTagMatches(etag, hash))
                                throw new InvalidDataException("Catalog digest mismatch.");
                            return hash == installedHash ? null : bytes;
                        }
                    }
                }
                catch (Exception error)
                {
                    token.ThrowIfCancellationRequested();
                    if (deadline.IsCancellationRequested || error is OperationCanceledException) throw new HttpRequestException("Update server timed out",error);
                    throw;
                }
            }
        }
        private static bool CatalogTagMatches(EntityTagHeaderValue tag, string hash)
        {
            string value = tag.Tag.Trim('"');
            if (value == hash) return true;
            return value == hash + "-gzip" || value == hash + "-deflate" || value == hash + "-br" || value == hash + "-zstd";
        }
        internal static UpdatePlan MakePlan(byte[] manifest, Dictionary<string,AssetEntry> baseline, Dictionary<string,AssetEntry> current, string currentRoot)
        {
            Dictionary<string,AssetEntry> remote;
            using(var data = new MemoryStream(manifest,false)) remote = BundledAssets.ReadCatalog(data);
            if (remote.Count == 0 || remote.Count > 200000 || baseline.Count == 0) throw new InvalidDataException("Empty or excessive catalog");
            var plan = new UpdatePlan {Manifest=manifest,Remote=remote,Current=current,CurrentRoot=currentRoot};
            long total = 0;
            foreach (var asset in remote)
            {
                if (asset.Value.Size < 0 || asset.Value.Size > MaxFile) throw new InvalidDataException("Unsupported asset size");
                total=checked(total+asset.Value.Size);
                if(total>MaxInstall)throw new InvalidDataException("Catalog exceeds install limit");
                if (Matches(current,asset.Key,asset.Value)) continue;
                plan.Changed++;
                if(!Matches(baseline,asset.Key,asset.Value))plan.DownloadBytes+=asset.Value.Size;
            }
            plan.Removed=current.Keys.Count(path=>!remote.ContainsKey(path));
            return plan;
        }
        private static bool Matches(Dictionary<string,AssetEntry> catalog, string path,AssetEntry expected)
        {
            AssetEntry item;
            return catalog.TryGetValue(path,out item) && item.Size == expected.Size && String.Equals(item.Hash,expected.Hash,StringComparison.OrdinalIgnoreCase);
        }
        private static string FormatBytes(long bytes)
        {
            return bytes >= 1048576 ? (bytes/1048576.0).ToString("0.#",CultureInfo.CurrentCulture) + " MB" : Math.Ceiling(bytes/1024.0).ToString("N0",CultureInfo.CurrentCulture)+" KB";
        }
        private static async Task InstallPlan(UpdatePlan plan,HttpClient client,IProgress<string> status,CancellationToken token)
        {
            Func<string,Stream,long,CancellationToken,Task> download = async (path,destination,limit,cancel) => {
                string url = String.Join("/",path.Split('/').Select(Uri.EscapeDataString));
                using (var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel))
                {
                    deadline.CancelAfter(TimeSpan.FromMinutes(6));
                    try
                    {
                        using (var response = await client.GetAsync(new Uri(website,url),HttpCompletionOption.ResponseHeadersRead,deadline.Token))
                        {
                            response.EnsureSuccessStatusCode();
                            using (deadline.Token.Register(response.Dispose))
                            using (var source = await response.Content.ReadAsStreamAsync())
                                await Transfer(source,destination,limit,deadline.Token);
                        }
                    }
                    catch (Exception error)
                    {
                        cancel.ThrowIfCancellationRequested();
                        if (deadline.IsCancellationRequested || error is OperationCanceledException) throw new HttpRequestException("Asset download timed out",error);
                        throw;
                    }
                }
            };
            string committed=await Task.Run(()=>Install(plan,BundledAssets.Baseline,BundledAssets.UpdatesRoot,download,status,token),token);
            pendingRoot=committed;
            pendingCatalog=plan.Remote;
            pendingHash=BundledAssets.HashBytes(plan.Manifest);
        }
        internal static async Task<string> Install(UpdatePlan plan, Dictionary<string,AssetEntry> baseline, string updates, Func<string,Stream,long,CancellationToken,Task> fetch, IProgress<string> status, CancellationToken token)
        {
            Directory.CreateDirectory(updates);
            string id=Guid.NewGuid().ToString("D");
            string stage=Path.Combine(updates,id);
            Directory.CreateDirectory(stage);
            bool active=false;
            try
            {
                var changed=plan.Remote.Where(p=>!Matches(baseline,p.Key,p.Value)).ToArray();
                long required=changed.Sum(p=>p.Value.Size);
                if(new DriveInfo(Path.GetPathRoot(Path.GetFullPath(updates))).AvailableFreeSpace < required + plan.Manifest.Length + 10485760L)
                    throw new IOException("Insufficient space");
                int finished = 0;
                var progressClock = System.Diagnostics.Stopwatch.StartNew();
                foreach (var asset in changed)
                {
                    token.ThrowIfCancellationRequested();
                    string path = asset.Key.Replace('/',Path.DirectorySeparatorChar);
                    string output = Path.Combine(stage,"files",path);
                    Directory.CreateDirectory(Path.GetDirectoryName(output));
                    if (status != null && (finished == 0 || progressClock.ElapsedMilliseconds >= 120 || finished + 1 == changed.Length))
                    {
                        status.Report(String.Format("Island files · {0:N0} of {1:N0}", finished + 1, changed.Length));
                        progressClock.Restart();
                    }
                    bool reused = false;
                    if (plan.CurrentRoot != null && Matches(plan.Current,asset.Key,asset.Value))
                    {
                        string previous = Path.Combine(plan.CurrentRoot,"files",path);
                        if (File.Exists(previous))
                        {
                            try
                            {
                                reused = await WriteVerified(output, asset.Value, async target => {
                                    using (var source = File.OpenRead(previous))
                                        await Transfer(source, target, asset.Value.Size, token);
                                });
                            }
                            catch (FileNotFoundException) {}
                            catch (DirectoryNotFoundException) {}
                            catch (InvalidDataException) {}
                        }
                    }
                    if (!reused && !await WriteVerified(output, asset.Value, target => fetch(asset.Key,target,asset.Value.Size,token)))
                        throw new InvalidDataException("Incorrect asset");
                    finished++;
                }
                foreach(string path in baseline.Keys.Where(p=>!plan.Remote.ContainsKey(p)))
                {
                    token.ThrowIfCancellationRequested();
                    string marker=Path.Combine(stage,"removed",path.Replace('/',Path.DirectorySeparatorChar));
                    Directory.CreateDirectory(Path.GetDirectoryName(marker));
                    using(File.Create(marker)){}
                }
                File.WriteAllBytes(Path.Combine(stage,"catalog.tsv"),plan.Manifest);
                token.ThrowIfCancellationRequested();
                AtomicWrite(Path.Combine(updates,"active.txt"),id);
                active=true;
                return stage;
            }
            finally
            {
                if(!active && Directory.Exists(stage) && String.Equals(Path.GetDirectoryName(Path.GetFullPath(stage)),Path.GetFullPath(updates).TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase))
                    Directory.Delete(stage,true);
            }
        }
        private static async Task<bool> WriteVerified(string path, AssetEntry asset, Func<Stream,Task> write)
        {
            using (var file = File.Create(path))
            using (var hash = SHA256.Create())
            using (var stream = new CryptoStream(file, hash, CryptoStreamMode.Write))
            {
                await write(stream);
                stream.FlushFinalBlock();
                string digest = BitConverter.ToString(hash.Hash).Replace("-", "");
                return file.Length == asset.Size && digest.Equals(asset.Hash,StringComparison.OrdinalIgnoreCase);
            }
        }
        private static async Task Transfer(Stream source,Stream target,long limit,CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            byte[] buffer=new byte[81920];
            long length=0;
            int read;
            while((read=await source.ReadAsync(buffer,0,buffer.Length,token).ConfigureAwait(false))!=0)
            {
                length+=read;
                if(length>limit)throw new InvalidDataException("Download exceeds size");
                await target.WriteAsync(buffer,0,read,token).ConfigureAwait(false);
            }
        }
        internal static void AtomicWrite(string path,string contents)
        {
            string temp=path+"."+Guid.NewGuid().ToString("N")+".tmp";
            try
            {
                using(var stream=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None))
                {
                    byte[] bytes=Encoding.UTF8.GetBytes(contents);
                    stream.Write(bytes,0,bytes.Length);
                    stream.Flush(true);
                }
                if(File.Exists(path))File.Replace(temp,path,null);
                else File.Move(temp,path);
            }
            finally { if(File.Exists(temp))File.Delete(temp); }
        }
    }
}
