using System;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace PoptropicaDesktop
{
    internal sealed class PlayerRelease
    {
        internal const int MaxBytes = 16 * 1024 * 1024;
        internal const string Channel = "poptropica-player-win-x64-v1";
        internal readonly Version Version;
        internal readonly int Size;
        internal readonly string Hash;
        internal readonly byte[] Manifest;

        private PlayerRelease(Version version,int size,string hash,byte[] manifest)
        {
            Version=version; Size=size; Hash=hash; Manifest=manifest;
        }

        internal static string Store
        {
            get
            {
                string root=Environment.GetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT");
                if(String.IsNullOrEmpty(root))root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Poptropica.love","Desktop");
                return Path.Combine(root,"PlayerReleases","v1");
            }
        }

        internal static PlayerRelease Parse(byte[] manifest)
        {
            if(manifest.Length>512)throw new InvalidDataException("Invalid player release.");
            string text=Encoding.ASCII.GetString(manifest);
            string[] lines=text.Split('\n');
            Version version;
            int size;
            if(lines.Length!=6 || lines[0]!=Channel || lines[5]!="" ||
                !System.Version.TryParse(lines[1],out version) || version.Revision<0 || version.ToString(4)!=lines[1] ||
                !Int32.TryParse(lines[2],NumberStyles.None,CultureInfo.InvariantCulture,out size) || size<=0 || size>MaxBytes ||
                !Regex.IsMatch(lines[3],@"\A[a-f0-9]{64}\z") || !Regex.IsMatch(lines[4],@"\A[A-Za-z0-9+/]{86}==\z"))
                throw new InvalidDataException("Invalid player release.");
            byte[] signature=Convert.FromBase64String(lines[4]);
            byte[] statement=Encoding.ASCII.GetBytes(String.Join("\n",lines,0,4)+"\n");
            using(var resource=typeof(PlayerRelease).Assembly.GetManifestResourceStream("PlayerReleaseKey"))
            using(var publicKey=new MemoryStream())
            {
                resource.CopyTo(publicKey);
                using(var key=CngKey.Import(publicKey.ToArray(),CngKeyBlobFormat.EccPublicBlob))
                using(var verifier=new ECDsaCng(key))
                {
                    verifier.HashAlgorithm=CngAlgorithm.Sha256;
                    if(!verifier.VerifyData(statement,signature))throw new InvalidDataException("Unrecognized player signature.");
                }
            }
            return new PlayerRelease(version,size,lines[3],manifest);
        }

        internal void Verify(byte[] image)
        {
            using(var sha=SHA256.Create())
                if(image.Length!=Size || BitConverter.ToString(sha.ComputeHash(image)).Replace("-","").ToLowerInvariant()!=Hash)
                    throw new InvalidDataException("Player download is damaged.");
        }

        internal static PlayerRelease Read(string slot,out byte[] image)
        {
            image=null;
            try
            {
                using(var file=File.OpenRead(Path.Combine(Store,slot)))
                using(var reader=new BinaryReader(file))
                {
                    int length=reader.ReadInt32();
                    if(length<=0 || length>512)return null;
                    var release=Parse(reader.ReadBytes(length));
                    if(file.Length-file.Position!=release.Size)return null;
                    var bytes=reader.ReadBytes(release.Size);
                    release.Verify(bytes);
                    image=bytes;
                    return release;
                }
            }
            catch(IOException) {}
            catch(UnauthorizedAccessException) {}
            catch(InvalidDataException) {}
            catch(CryptographicException) {}
            return null;
        }

        internal void Stage(byte[] image,System.Threading.CancellationToken token)
        {
            Verify(image);
            Directory.CreateDirectory(Store);
            string temp=Path.Combine(Store,Guid.NewGuid().ToString("N")+".tmp");
            string next=Path.Combine(Store,"next.pack");
            try
            {
                using(var writer=new BinaryWriter(new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)))
                {
                    writer.Write(Manifest.Length); writer.Write(Manifest); writer.Write(image);
                    writer.Flush(); ((FileStream)writer.BaseStream).Flush(true);
                }
                token.ThrowIfCancellationRequested();
                if(File.Exists(next))File.Replace(temp,next,null);
                else File.Move(temp,next);
            }
            finally { if(File.Exists(temp)) File.Delete(temp); }
        }
    }
}
