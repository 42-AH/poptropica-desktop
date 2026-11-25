using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

class RangeBench
{
    [STAThread] public static int Main(string[] args)
    {
        string dir=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        Application.EnableVisualStyles();
        var host=new Form{ShowInTaskbar=false};
        var view=new WebView2{Dock=DockStyle.Fill};
        host.Controls.Add(view);
        var log=Path.Combine(dir,"range-results.txt");
        Environment.SetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT",Path.Combine(dir,"test-data"));
        host.Shown+=async delegate{
            try
            {
                var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dir,"test-profile"),new CoreWebView2EnvironmentOptions("--host-resolver-rules=\"MAP * ~NOTFOUND\" --disable-background-networking"));
                await view.EnsureCoreWebView2Async(env);
                var web=view.CoreWebView2;
                var assembly=Assembly.LoadFrom(Path.Combine(dir,"Poptropica.exe"));
                var assets=assembly.GetType("PoptropicaDesktop.BundledAssets",true);
                assets.GetMethod("Attach",BindingFlags.Static | BindingFlags.NonPublic).Invoke(null,new[]{web});
                web.WebResourceRequested+=(s,e)=>{
                    if(e.Request.Uri=="https://poptropica.love/_rangebench")
                    {
                        var html=File.ReadAllBytes(Path.Combine(dir,"probe.html"));
                        e.Response=env.CreateWebResourceResponse(new MemoryStream(html),200,"OK","Content-Type: text/html");
                    }
                };
                var result=new TaskCompletionSource<string>();
                web.WebMessageReceived+=(s,e)=>result.TrySetResult(e.TryGetWebMessageAsString());
                web.Navigate("https://poptropica.love/_rangebench");
                if(await Task.WhenAny(result.Task,Task.Delay(60000))!=result.Task)throw new TimeoutException();
                var report=await result.Task;
                File.WriteAllText(log,report);
                if(!report.StartsWith("PASS"))Environment.ExitCode=1;
            }catch(Exception error){File.WriteAllText(log,error.ToString());Environment.ExitCode=1;}
            finally{host.Close();}
        };
        Application.Run(host);
        return Environment.ExitCode;
    }
}
