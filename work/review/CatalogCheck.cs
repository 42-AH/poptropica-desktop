using System;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using PoptropicaDesktop;
class CatalogCheck {
    class Receipt : DelegatingHandler {
        internal Receipt() : base(new HttpClientHandler {AllowAutoRedirect=false,AutomaticDecompression=DecompressionMethods.GZip | DecompressionMethods.Deflate,UseCookies=false}){}
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancel) {
            var response=await base.SendAsync(request,cancel).ConfigureAwait(false);
            Console.WriteLine("HTTP "+(int)response.StatusCode+" "+response.Headers.ETag);
            return response;
        }
    }
    static void Main() {
        ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
        using(var http=new HttpClient(new Receipt())){
            var baseline=BundledUpdater.FetchCatalog(http,BundledAssets.BaselineHash,CancellationToken.None).GetAwaiter().GetResult();
            if(baseline!=null)throw new Exception("unexpected delta");
            var old=BundledUpdater.FetchCatalog(http,new string('0',64),CancellationToken.None).GetAwaiter().GetResult();
            if(old==null || BundledAssets.HashBytes(old)!=BundledAssets.BaselineHash)throw new Exception("update content mismatch");
            Console.WriteLine("Changed-generation response validated: "+old.Length+" bytes. Current generation required no body.");
        }
    }
}
