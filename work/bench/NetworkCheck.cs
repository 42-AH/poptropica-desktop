using System;
using System.Net;
using System.Net.Http;
class NetworkCheck {
 static void Main(){
  ServicePointManager.SecurityProtocol=(SecurityProtocolType)0;
  var uri=new Uri("https://poptropica.love/api/desktop-assets.php");
  Console.WriteLine("Proxy bypass "+ WebRequest.DefaultWebProxy.IsBypassed(uri));
  foreach(var use in new[]{true,false}){
   try{
    using(var handler=new HttpClientHandler{UseProxy=use,AllowAutoRedirect=false,AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate,UseCookies=false})
    using(var c=new HttpClient(handler)){
     c.DefaultRequestHeaders.UserAgent.ParseAdd("PoptropicaDesktop/1.0");
     var r=c.GetAsync(uri).GetAwaiter().GetResult();Console.WriteLine(use+" status "+(int)r.StatusCode+" bytes "+r.Content.ReadAsByteArrayAsync().Result.Length);
    }
   }catch(Exception e){while(e!=null){Console.WriteLine(e.GetType().Name+" "+e.Message);e=e.InnerException;}}
  }
 }
}
