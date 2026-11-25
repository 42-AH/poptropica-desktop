using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace PoptropicaDesktop
{
    internal static class PlayerUpdates
    {
        private static readonly Uri feed=new Uri("https://poptropica.love/desktop/player/v1/");
        internal static readonly Version Running=typeof(PlayerUpdates).Assembly.GetName().Version;
        internal static bool Pending;

        private static async Task<byte[]> Download(HttpClient client,string name,int limit,CancellationToken token)
        {
            using(var deadline=CancellationTokenSource.CreateLinkedTokenSource(token))
            {
                deadline.CancelAfter(TimeSpan.FromSeconds(45));
                using(var response=await client.GetAsync(new Uri(feed,name),HttpCompletionOption.ResponseHeadersRead,deadline.Token).ConfigureAwait(false))
                {
                    response.EnsureSuccessStatusCode();
                    if(response.StatusCode!=HttpStatusCode.OK || response.Content.Headers.ContentLength>limit)throw new InvalidDataException("Invalid player download.");
                    using(deadline.Token.Register(response.Dispose))
                    using(var input=await response.Content.ReadAsStreamAsync().ConfigureAwait(false))
                    using(var output=new MemoryStream())
                    {
                        byte[] buffer=new byte[65536]; int n;
                        while((n=await input.ReadAsync(buffer,0,buffer.Length,deadline.Token).ConfigureAwait(false))!=0)
                        {
                            if(output.Length+n>limit)throw new InvalidDataException("Player download is too large.");
                            output.Write(buffer,0,n);
                        }
                        return output.ToArray();
                    }
                }
            }
        }

        internal static async Task<PlayerRelease> Check(HttpClient client,CancellationToken token)
        {
            var release=PlayerRelease.Parse(await Download(client,"latest.txt",512,token).ConfigureAwait(false));
            byte[] unused;
            var next=PlayerRelease.Read("next.pack",out unused);
            Pending=next!=null && next.Version>Running;
            if(release.Version<=Running || (Pending && release.Version<=next.Version))return null;
            return release;
        }

        internal static async Task Install(HttpClient client,PlayerRelease release,CancellationToken token)
        {
            var bytes=await Download(client,release.Hash+".bin",release.Size,token).ConfigureAwait(false);
            release.Stage(bytes,token);
            Pending=true;
        }
    }
}
