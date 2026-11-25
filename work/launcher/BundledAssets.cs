using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;

namespace PoptropicaDesktop
{
    internal sealed class AssetEntry
    {
        internal readonly string Hash;
        internal readonly long Size;
        internal AssetEntry(string hash, long size) { Hash = hash; Size = size; }
    }

    internal static class BundledAssets
    {
        internal const string BaselineHash = "68616f0c56b6813787b398f4df7b5fe860741f7fb89216687f715451024a2f3f";
        private sealed class Installed
        {
            internal string Root;
            internal string Hash = BaselineHash;
            internal Dictionary<string,AssetEntry> Entries;
        }

        internal static readonly string BaseRoot = Path.Combine(EmbeddedGame.InstallFolder, "offline");
        internal static readonly string UpdatesRoot = Path.Combine(Environment.GetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Poptropica.love\Desktop"), "Updates");
        private static readonly Regex Digest = new Regex("^[a-f0-9]{64}$", RegexOptions.Compiled);
        private static readonly Regex Device = new Regex(@"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly char[] Invalid = Path.GetInvalidFileNameChars();
        private static readonly Lazy<Dictionary<string,AssetEntry>> baseline = new Lazy<Dictionary<string,AssetEntry>>(ReadBase);
        private static readonly Lazy<Installed> installed = new Lazy<Installed>(ReadInstalled);
        private static readonly Lazy<Task<Dictionary<string,AssetEntry>>> ready = new Lazy<Task<Dictionary<string,AssetEntry>>>(() => Task.Run(() => { var original = Baseline; return installed.Value.Entries ?? original; }));
        private static readonly VerifiedAssetCache files = new VerifiedAssetCache(24 * 1024 * 1024,1024);
        private static Task<Dictionary<string,AssetEntry>> official;
        private static DateTime nextOfficialAttempt;

        internal static string ActiveRoot { get { return installed.Value.Root; } }
        internal static string CatalogHash { get { return installed.Value.Hash; } }
        internal static Dictionary<string,AssetEntry> Baseline { get { return baseline.Value; } }
        internal static Dictionary<string,AssetEntry> Catalog { get { return installed.Value.Entries ?? Baseline; } }

        internal static string HashBytes(byte[] bytes)
        {
            using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();
        }

        internal static Dictionary<string,AssetEntry> ReadCatalog(Stream source)
        {
            var result = new Dictionary<string,AssetEntry>(StringComparer.Ordinal);
            var uniquePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var reader = new StreamReader(source,new UTF8Encoding(false,true),true,65536,true))
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    string[] fields = line.Split('\t');
                    long size;
                    if (fields.Length != 3 || !Digest.IsMatch(fields[0]) || !Int64.TryParse(fields[1],System.Globalization.NumberStyles.None,System.Globalization.CultureInfo.InvariantCulture,out size) || size > 768L*1024*1024 || fields[2].Length > 210 || Mime(fields[2]) == null || !uniquePaths.Add(fields[2]) || result.Count >= 120000)
                        throw new InvalidDataException("Invalid island catalog.");
                    foreach (string part in fields[2].Split('/'))
                        if (part.Length == 0 || part.IndexOfAny(Invalid) >= 0 || part.EndsWith(".") || part.EndsWith(" ") || Device.IsMatch(part))
                            throw new InvalidDataException("Invalid island filename.");
                    result.Add(fields[2],new AssetEntry(fields[0],size));
                }
            }
            if (result.Count == 0) throw new InvalidDataException("Empty island catalog.");
            return result;
        }

        private static Dictionary<string,AssetEntry> ReadBase()
        {
            byte[] bytes = File.ReadAllBytes(Path.Combine(BaseRoot,"catalog.tsv"));
            if (HashBytes(bytes) != BaselineHash) throw new InvalidDataException("The bundled island catalog is damaged.");
            using (var stream = new MemoryStream(bytes)) return ReadCatalog(stream);
        }

        private static Installed ReadInstalled()
        {
            try
            {
                string value = File.ReadAllText(Path.Combine(UpdatesRoot,"active.txt")).Trim();
                Guid id;
                if (Guid.TryParse(value,out id) && value == Path.GetFileName(value))
                {
                    string directory = Path.Combine(UpdatesRoot,value);
                    string file = Path.Combine(directory,"catalog.tsv");
                    if (new FileInfo(file).Length <= 32L * 1024 * 1024)
                    {
                        byte[] bytes = File.ReadAllBytes(file);
                        using (var stream = new MemoryStream(bytes,false))
                            return new Installed { Root=directory, Hash=HashBytes(bytes), Entries=ReadCatalog(stream) };
                    }
                }
            }
            catch (IOException) {}
            catch (InvalidDataException) {}
            catch (UnauthorizedAccessException) {}
            catch (ArgumentException) {}
            return new Installed();
        }

        private static Task<Dictionary<string,AssetEntry>> OfficialCatalog()
        {
            if (official == null || ((official.IsCanceled || official.IsFaulted) && DateTime.UtcNow >= nextOfficialAttempt))
            {
                nextOfficialAttempt = DateTime.UtcNow.AddSeconds(30);
                official = ReadOfficial();
            }
            return official;
        }

        private static async Task<Dictionary<string,AssetEntry>> ReadOfficial()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            using (var handler = new HttpClientHandler {AllowAutoRedirect=false,UseCookies=false,AutomaticDecompression=DecompressionMethods.GZip | DecompressionMethods.Deflate})
            using (var client = new HttpClient(handler) {Timeout=TimeSpan.FromSeconds(20), MaxResponseContentBufferSize=32*1024*1024})
            {
                byte[] manifest = await BundledUpdater.FetchCatalog(client,CatalogHash,CancellationToken.None).ConfigureAwait(false);
                if (manifest == null) return Catalog;
                using (var stream = new MemoryStream(manifest)) return ReadCatalog(stream);
            }
        }

        private static string Mime(string path)
        {
            if (path.IndexOfAny(Path.GetInvalidPathChars()) >= 0) return null;
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".swf": return "application/x-shockwave-flash";
                case ".wasm": return "application/wasm";
                case ".js": return path.StartsWith("ruffle/",StringComparison.Ordinal) ? "text/javascript" : null;
                case ".html": return path == "game/index.html" ? "text/html; charset=utf-8" : null;
                case ".xml": return "application/xml";
                case ".json": return "application/json";
                case ".txt": return "text/plain";
                case ".png": return "image/png";
                case ".jpg": case ".jpeg": return "image/jpeg";
                case ".webp": return "image/webp";
                case ".gif": return "image/gif";
                case ".svg": return "image/svg+xml";
                case ".ico": return "image/x-icon";
                case ".ttf": return "font/ttf";
                case ".mp3": return "audio/mpeg";
                case ".ogg": return "audio/ogg";
                case ".wav": return "audio/wav";
                case ".flv": return "video/x-flv";
                case ".pop": return "application/octet-stream";
                default: return null;
            }
        }

        internal static bool ReadRange(string value, int length, out int first, out int last)
        {
            first = 0;
            last = length - 1;
            if (length == 0 || !value.StartsWith("bytes=",StringComparison.OrdinalIgnoreCase)) return false;
            string[] ends = value.Substring(6).Split('-');
            if (ends.Length != 2) return false;
            long number;
            var style = System.Globalization.NumberStyles.None;
            var culture = System.Globalization.CultureInfo.InvariantCulture;
            if (ends[0].Length == 0)
            {
                if (!Int64.TryParse(ends[1],style,culture,out number) || number == 0) return false;
                first = length - (int)Math.Min(number,length);
                return true;
            }
            if (!Int64.TryParse(ends[0],style,culture,out number) || number >= length) return false;
            first = (int)number;
            if (ends[1].Length == 0) return true;
            if (!Int64.TryParse(ends[1],style,culture,out number) || number < first) return false;
            last = (int)Math.Min(number,last);
            return true;
        }

        internal static void Attach(CoreWebView2 web)
        {
            web.AddWebResourceRequestedFilter("https://poptropica.love/*",CoreWebView2WebResourceContext.All);
            web.WebResourceRequested += async delegate(object sender,CoreWebView2WebResourceRequestedEventArgs args)
            {
                var request = args.Request;
                var uri = new Uri(request.Uri);
                if (uri.GetLeftPart(UriPartial.Authority) != "https://poptropica.love" || request.Method != "GET") return;
                var path = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));
                var type = Mime(path);
                if (type == null) return;
                using (var wait = args.GetDeferral())
                {
                    try
                    {
                        AssetEntry chosen, original;
                        var current = await ready.Value;
                        if (!current.TryGetValue(path,out chosen)) return;
                        bool fromBase = Baseline.TryGetValue(path,out original) && original.Hash == chosen.Hash;
                        if (!fromBase)
                        {
                            AssetEntry published;
                            if (!(await OfficialCatalog()).TryGetValue(path,out published) || published.Hash != chosen.Hash) return;
                        }
                        var file = Path.Combine(fromBase ? Path.Combine(BaseRoot,"public") : Path.Combine(ActiveRoot,"files"),path);
                        byte[] bytes = await files.Read(file,chosen);
                        if (bytes == null || bytes.LongLength != chosen.Size) return;
                        int first = 0, last = bytes.Length - 1;
                        bool partial = request.Headers.Contains("Range");
                        if (partial && !ReadRange(request.Headers.GetHeader("Range"), bytes.Length, out first, out last)) return;
                        int length = last - first + 1;
                        string headers = "Content-Type: "+type+"\r\nContent-Length: "+length+"\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nX-Poptropica-Asset: installed";
                        if (partial) headers += "\r\nContent-Range: bytes "+first+"-"+last+"/"+bytes.Length;
                        args.Response = web.Environment.CreateWebResourceResponse(new MemoryStream(bytes,first,length,false),partial ? 206 : 200,partial ? "Partial Content" : "OK",headers);
                    }
                    catch (Exception) {}

                }
            };
        }
    }
}

