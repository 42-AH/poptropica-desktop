using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using PoptropicaDesktop;
class LiveCheck {
    static void Main(string[] args) {
        Environment.SetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT",args[0]);
        ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
        using(var client=new HttpClient(new HttpClientHandler {AllowAutoRedirect=false})) {
            var token=CancellationToken.None;
            var release=PlayerUpdates.Check(client,token).GetAwaiter().GetResult();
            PlayerUpdates.Install(client,release,token).GetAwaiter().GetResult();
            byte[] data;
            var saved=PlayerRelease.Read("next.pack",out data);
            if(saved==null || saved.Hash!=release.Hash || saved.Version.ToString()!="1.1.0.0")throw new Exception("Receipt mismatch");
            Console.WriteLine("Verified live signed player "+saved.Version+" ("+data.Length+" bytes)");
        }
    }
}
