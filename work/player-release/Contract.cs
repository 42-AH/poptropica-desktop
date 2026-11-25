using System;
using System.IO;
using System.Text;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using PoptropicaDesktop;
class Contract
{
    private sealed class Feed:HttpMessageHandler
    {
        internal byte[] Manifest,Payload;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)
        {
            var content=request.RequestUri.AbsolutePath.EndsWith("latest.txt")?Manifest:Payload;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new ByteArrayContent(content)});
        }
    }
    static void Assert(bool condition){if(!condition)throw new Exception("Release contract failed");}
    static void Reject(Action action){try{action();}catch(InvalidDataException){return;}throw new Exception("Invalid release accepted");}
    static async Task Test(string root,string feed)
    {
        Environment.SetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT",root);
        var handler=new Feed{Manifest=File.ReadAllBytes(Path.Combine(feed,"latest.txt")),Payload=File.ReadAllBytes(Directory.GetFiles(feed,"*.bin")[0])};
        var release=PlayerRelease.Parse(handler.Manifest);
        using(var client=new HttpClient(handler)){
            Assert(await PlayerUpdates.Check(client,CancellationToken.None)!=null);
            var tampered=(byte[])handler.Payload.Clone();tampered[120]^=1;
            Reject(()=>release.Stage(tampered,CancellationToken.None));
            Reject(()=>PlayerRelease.Parse(Encoding.ASCII.GetBytes(Encoding.ASCII.GetString(handler.Manifest).Replace("1.1.0.0","2.1.0.0"))));
            await PlayerUpdates.Install(client,release,CancellationToken.None);
            byte[] actual;Assert(PlayerRelease.Read("next.pack",out actual).Version==release.Version);
            try{release.Stage(handler.Payload,new CancellationToken(true));throw new Exception("Cancellation ignored");}catch(OperationCanceledException){}
            Assert(await PlayerUpdates.Check(client,CancellationToken.None)==null && PlayerUpdates.Pending);
            var saved=Path.Combine(PlayerRelease.Store,"next.pack");
            var bytes=File.ReadAllBytes(saved);bytes[bytes.Length-2]^=1;File.WriteAllBytes(saved,bytes);
            Assert(PlayerRelease.Read("next.pack",out actual)==null);
        }
        Console.WriteLine("Release signature, altered version, altered payload, staged update, cancellation, repeated check and damaged disk copy passed.");
    }
    static void Main(string[] args){Test(args[0],args[1]).GetAwaiter().GetResult();}
}
