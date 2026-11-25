using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Poptropica")]
[assembly: AssemblyProduct("Poptropica")]
[assembly: AssemblyDescription("Poptropica for Windows")]

internal sealed class GamePackage : IDisposable
{
    private readonly FileStream input;
    private readonly long offset;
    private readonly long compressed;
    private readonly long expanded;
    private readonly byte[] digest;
    internal readonly string Version;
    internal readonly string Cache;
    private const int FooterSize = 64;

    internal GamePackage()
    {
        input = File.OpenRead(Application.ExecutablePath);
        if (input.Length <= FooterSize) throw new InvalidDataException("This copy is incomplete. Download Poptropica again.");
        input.Position = input.Length - FooterSize;
        using (var footer = new BinaryReader(input, Encoding.UTF8, true))
        {
            offset = footer.ReadInt64();
            compressed = footer.ReadInt64();
            expanded = footer.ReadInt64();
            digest = footer.ReadBytes(32);
            if (Encoding.ASCII.GetString(footer.ReadBytes(8)) != "POPLOVE1" || offset < 1 || compressed < 1 ||
                offset > input.Length - FooterSize || compressed != input.Length - FooterSize - offset || expanded < 1)
                throw new InvalidDataException("This copy is incomplete. Download Poptropica again.");
        }
        Version = BitConverter.ToString(digest).Replace("-", "").ToLowerInvariant();
        var root = Environment.GetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT");
        if (String.IsNullOrWhiteSpace(root))
            root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Poptropica.love","Desktop");
        Cache = Path.Combine(Path.GetFullPath(root),"Versions",Version.Substring(0,24));
    }

    private bool Ready(string destination)
    {
        string marker = Path.Combine(destination,"complete");
        if (!File.Exists(marker) || new FileInfo(marker).Length != Version.Length || File.ReadAllText(marker) != Version) return false;
        using (var manifest = new StreamReader(typeof(GamePackage).Assembly.GetManifestResourceStream("StartupFiles")))
        using (var sha = SHA256.Create())
        {
            string row;
            while ((row = manifest.ReadLine()) != null)
            {
                var name = row.Substring(65).Replace('/','\\');
                var path = Path.Combine(destination,name);
                if (!File.Exists(path)) return false;
                using (var file = File.OpenRead(path))
                {
                    if (!String.Equals(BitConverter.ToString(sha.ComputeHash(file)).Replace("-",""),row.Substring(0,64),StringComparison.OrdinalIgnoreCase))
                        return false;
                }
            }
        }
        return true;
    }

    internal void Extract(string destination, CancellationToken cancel, Action<string,int> update)
    {
        destination = Path.GetFullPath(destination);
        string key;
        using (var hash = SHA256.Create())
            key = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(destination.ToUpperInvariant())),0,16).Replace("-","");
        using (var gate = new Mutex(false,@"Local\PoptropicaInstall"+key))
        {
            try
            {
                if (WaitHandle.WaitAny(new WaitHandle[]{gate,cancel.WaitHandle}) != 0) throw new OperationCanceledException(cancel);
            }
            catch (AbandonedMutexException) {}
            try { ExtractLocked(destination,cancel,update); }
            finally { gate.ReleaseMutex(); }
        }
    }

    private void Promote(string stage,string destination,bool managed)
    {
        string previous = null;
        if (Directory.Exists(destination))
        {
            if (!managed) throw new IOException("Choose a new folder for the game files.");
            previous = Path.Combine(Path.GetDirectoryName(destination),"recovered-"+Version.Substring(0,12)+"-"+Guid.NewGuid().ToString("N").Substring(0,12));
            Directory.Move(destination,previous);
        }
        try { Directory.Move(stage,destination); }
        catch
        {
            if (previous != null && !Directory.Exists(destination)) Directory.Move(previous,destination);
            throw;
        }
    }

    private void ExtractLocked(string destination,CancellationToken cancel,Action<string,int> update)
    {
        if (Ready(destination)) return;
        bool managed = String.Equals(destination,Cache,StringComparison.OrdinalIgnoreCase);
        bool repair = Directory.Exists(destination);
        if (repair && !managed) throw new IOException("Choose a new folder for the game files.");
        string parent = Path.GetDirectoryName(destination);
        Directory.CreateDirectory(parent);
        string scratch = Path.Combine(parent,managed ? ".unpack-"+Version.Substring(0,24) : ".unpack-"+Guid.NewGuid().ToString("N"));
        if (Directory.Exists(scratch))
        {
            string owner = Path.Combine(scratch,"owner");
            bool local = (File.GetAttributes(scratch) & FileAttributes.ReparsePoint) == 0;
            if (local && File.Exists(owner) && new FileInfo(owner).Length == Version.Length && File.ReadAllText(owner) == Version)
            {
                string staged = Path.Combine(scratch,"files");
                if (Ready(staged))
                {
                    cancel.ThrowIfCancellationRequested();
                    Promote(staged,destination,managed);
                    Directory.Delete(scratch,true);
                    return;
                }
                update("Preparing game files",0);
                Directory.Delete(scratch,true);
            }
            else if (!local || Directory.GetFileSystemEntries(scratch).Length != 0)
                scratch = Path.Combine(parent,".unpack-"+Guid.NewGuid().ToString("N"));
        }
        if (new DriveInfo(Path.GetPathRoot(parent)).AvailableFreeSpace < expanded + 160L * 1024 * 1024)
            throw new IOException("Free at least 1 GB on the drive, then open Poptropica again.");
        input.Position = offset;
        byte[] buffer = new byte[262144];
        using (var sha = SHA256.Create())
        {
            long left = compressed;
            while (left > 0)
            {
                cancel.ThrowIfCancellationRequested();
                int n = input.Read(buffer, 0, (int)Math.Min(buffer.Length, left));
                if (n == 0) throw new EndOfStreamException();
                sha.TransformBlock(buffer, 0, n, null, 0);
                left -= n;
                update("Checking game files", (int)((compressed-left)*10/compressed));
            }
            sha.TransformFinalBlock(buffer,0,0);
            if (BitConverter.ToString(sha.Hash) != BitConverter.ToString(digest)) throw new InvalidDataException("This copy is damaged. Download Poptropica again.");
        }
        Directory.CreateDirectory(scratch);
        File.WriteAllText(Path.Combine(scratch,"owner"),Version);
        string stage = Path.Combine(scratch,"files");
        Directory.CreateDirectory(stage);
        try
        {
            long written = 0;
            input.Position = offset;
            using (var gzip = new GZipStream(input, CompressionMode.Decompress, true))
            using (var data = new BinaryReader(gzip, new UTF8Encoding(false,true)))
            {
                int files = data.ReadInt32();
                if (files < 1 || files > 200000) throw new InvalidDataException("Invalid game file count.");
                for (int i=0; i<files; i++)
                {
                    cancel.ThrowIfCancellationRequested();
                    int nameSize = data.ReadUInt16();
                    long size = data.ReadInt64();
                    if (size < 0 || size > expanded-written || nameSize < 1 || nameSize > 4096) throw new InvalidDataException("Invalid game file.");
                    string name = new UTF8Encoding(false,true).GetString(data.ReadBytes(nameSize));
                    if (name.IndexOfAny(new[]{'\\',':','\0'}) >= 0 || name.StartsWith("/")) throw new InvalidDataException("Invalid game path.");
                    foreach (string part in name.Split('/'))
                        if (part.Length == 0 || part.EndsWith(".") || part.EndsWith(" ")) throw new InvalidDataException("Invalid game path.");
                    string path = Path.GetFullPath(Path.Combine(stage,name.Replace('/','\\')));
                    if (!path.StartsWith(stage+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Invalid game path.");
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    using (var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    {
                        long remaining = size;
                        while (remaining > 0)
                        {
                            cancel.ThrowIfCancellationRequested();
                            int n = data.Read(buffer,0,(int)Math.Min(remaining,buffer.Length));
                            if (n == 0) throw new EndOfStreamException();
                            output.Write(buffer,0,n);
                            remaining -= n;
                            written += n;
                        }
                    }
                    update(repair ? "Restoring game files" : "Unpacking the islands",10+(int)(90*written/expanded));
                }
                if (written != expanded || gzip.ReadByte() != -1 || !File.Exists(Path.Combine(stage,"Poptropica.exe"))) throw new InvalidDataException("The game files are incomplete.");
            }
            cancel.ThrowIfCancellationRequested();
            File.WriteAllText(Path.Combine(stage,"complete"),Version);
            Promote(stage,destination,managed);
        }
        finally
        {
            if (Directory.Exists(scratch)) Directory.Delete(scratch,true);
        }
    }

    public void Dispose() { input.Dispose(); }
}


