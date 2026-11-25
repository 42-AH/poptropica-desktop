using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;

namespace PoptropicaDesktop
{
    internal sealed class DesktopWorkspace
    {
        private const string Route = "/__desktop/workspace-v1";
        private readonly CoreWebView2 web;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024 };
        private readonly string functions;
        private string destination;

        private static string Resource(string name)
        {
            using(var stream=typeof(DesktopWorkspace).Assembly.GetManifestResourceStream(name))
            using(var reader=new StreamReader(stream,Encoding.UTF8))
                return reader.ReadToEnd();
        }

        internal DesktopWorkspace(CoreWebView2 web)
        {
            this.web=web;
            functions=Resource("SaveStore").Replace("export ","")+"\n"+Resource("OfflineWorkspace");
            var module=Encoding.UTF8.GetBytes(Resource("OfflinePlay"));
            string local=OfflineServer.Origin;
            string online=GameWindow.OnlineOrigin;
            foreach(var origin in new[]{local,online})
                web.AddWebResourceRequestedFilter(origin+Route,CoreWebView2WebResourceContext.Document);
            web.AddWebResourceRequestedFilter(local+"/cloud/play.mjs*",CoreWebView2WebResourceContext.Script);
            web.WebResourceRequested+=delegate(object sender,CoreWebView2WebResourceRequestedEventArgs e) {
                var uri=new Uri(e.Request.Uri);
                string path=uri.GetLeftPart(UriPartial.Path);
                if(path==local+Route || path==online+Route)
                {
                    var page=Encoding.UTF8.GetBytes("<!doctype html><meta charset=utf-8><title>Poptropica</title>");
                    e.Response=web.Environment.CreateWebResourceResponse(new MemoryStream(page),200,"OK","Content-Type: text/html\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; frame-ancestors 'none'");
                }
                else if(path==local+"/cloud/play.mjs")
                    e.Response=web.Environment.CreateWebResourceResponse(new MemoryStream(module),200,"OK","Content-Type: text/javascript\r\nCache-Control: no-store");
            };
        }

        internal bool Navigating { get { return destination!=null; } }
        internal bool Expects(string address) { return destination==address; }

        private async Task Open(string origin,CancellationToken token)
        {
            destination=origin+Route;
            var ready=new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            ulong id=0;
            EventHandler<CoreWebView2NavigationStartingEventArgs> starting=delegate(object sender,CoreWebView2NavigationStartingEventArgs e){if(e.Uri==destination)id=e.NavigationId;};
            EventHandler<CoreWebView2NavigationCompletedEventArgs> done=delegate(object sender,CoreWebView2NavigationCompletedEventArgs e){
                if(id==0 || e.NavigationId!=id)return;
                if(e.IsSuccess && web.Source==destination)ready.TrySetResult(true);
                else ready.TrySetException(new IOException("Could not open the saved adventure on this PC."));
            };
            web.NavigationStarting+=starting;
            web.NavigationCompleted+=done;
            try{
                using(var deadline=CancellationTokenSource.CreateLinkedTokenSource(token)){
                    deadline.CancelAfter(TimeSpan.FromSeconds(20));
                    using(deadline.Token.Register(()=>ready.TrySetCanceled())){
                        web.Navigate(destination);
                        await ready.Task;
                    }
                }
            }
            finally{web.NavigationStarting-=starting;web.NavigationCompleted-=done;}
        }

        private async Task<object> Run(string command,object input)
        {
            if(web.Source!=destination)throw new IOException("The game window changed during the save.");
            string expression="(async()=>{if(location.href!=="+json.Serialize(destination)+")throw Error('Unexpected page');"+
                functions+"\ntry{return {data:await transfer("+json.Serialize(command)+","+json.Serialize(input)+")};}catch(e){return {failure:String(e.message || e)};}})()";
            string response=await web.CallDevToolsProtocolMethodAsync("Runtime.evaluate",json.Serialize(new { expression=expression, awaitPromise=true, returnByValue=true }));
            var result=json.Deserialize<Dictionary<string,object>>(response);
            if(result.ContainsKey("exceptionDetails")){
                var problem=(Dictionary<string,object>)result["result"];
                string description=problem.ContainsKey("description")?(string)problem["description"]:"Could not prepare the local save.";
                throw new IOException(description.Split('\n')[0]);
            }
            var value=(Dictionary<string,object>)result["result"];
            var outcome=(Dictionary<string,object>)value["value"];
            if(outcome.ContainsKey("failure"))throw new IOException((string)outcome["failure"]);
            return outcome["data"];
        }

        internal async Task<string> Prepare(bool offline,CancellationToken token)
        {
            try{
                await Open(OfflineServer.Origin,token);
                object draft=await Run("leaveOffline",null);
                await Open(GameWindow.OnlineOrigin,token);
                object account=await Run("online",new {draft=draft,offline=offline});
                if(!offline)return null;
                await Open(OfflineServer.Origin,token);
                return (string)await Run("enterOffline",account);
            }
            finally{destination=null;}
        }
    }
}
