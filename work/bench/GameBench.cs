using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.WinForms;
class GameBench {
    static WebView2 Player(Control root){if(root is WebView2)return (WebView2)root;foreach(Control c in root.Controls){var value=Player(c);if(value!=null)return value;}return null;}
    [STAThread] static void Main(string[] args) {
        var directory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        var install = Path.GetFullPath(Path.Combine(directory,@"..\..\work\assembled"));
        if(args.Length==1) {
            var domain=AppDomain.CreateDomain("Game bench",null,new AppDomainSetup {ApplicationBase=install});
            try { Environment.ExitCode=domain.ExecuteAssembly(Assembly.GetExecutingAssembly().Location,new[]{"child",args[0]}); }
            finally{AppDomain.Unload(domain);}
            return;
        }
        var profile=Path.Combine(directory,args[1]);
        Directory.CreateDirectory(profile);
        File.WriteAllText(Path.Combine(profile,"automatic-updates"),"off");
        var assembly=Assembly.LoadFrom(Path.Combine(install,"Poptropica.exe"));
        var window=(Form)Activator.CreateInstance(assembly.GetType("PoptropicaDesktop.GameWindow"),BindingFlags.NonPublic|BindingFlags.Instance,null,new object[]{new[]{"--online"},profile},null);
        var view=Player(window);
        int hits=0; long bytes=0;
        view.CoreWebView2InitializationCompleted+=(s,e)=>{
            if(!e.IsSuccess)return;
            view.CoreWebView2.WebResourceResponseReceived+=(sender,eventArgs)=>{
                var response=eventArgs.Response;
                if(response.Headers.Contains("X-Poptropica-Asset")) {
                    hits++;long size;
                    if(long.TryParse(response.Headers.GetHeader("Content-Length"),out size))bytes+=size;
                }
            };
        };
        window.Shown+=async delegate {
            try {
                for(int i=0;i<400;i++){
                    await Task.Delay(250);
                    if(view.CoreWebView2==null)continue;
                    var value=await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(directory,"probe.js")));
                    if(value=="null" || value=="{}")continue;
                    File.WriteAllText(Path.Combine(directory,args[1]+".json"),value);
                    File.WriteAllText(Path.Combine(directory,args[1]+".hits"),hits+" "+bytes);
                    await Task.Delay(1800);
                    await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(Path.Combine(directory,"cadence.js")));
                    await Task.Delay(5500);
                    File.WriteAllText(Path.Combine(directory,args[1]+".frames"),await view.CoreWebView2.ExecuteScriptAsync("window.benchDrawn"));
                    using(var image=File.Create(Path.Combine(directory,args[1]+".jpg")))await view.CoreWebView2.CapturePreviewAsync(Microsoft.Web.WebView2.Core.CoreWebView2CapturePreviewImageFormat.Jpeg,image);
                    return;
                }
                throw new Exception("Timed out waiting for the start screen");
            } catch(Exception e){File.WriteAllText(Path.Combine(directory,"error.txt"),e.ToString());Environment.ExitCode=1;}
            finally{window.Close();}
        };
        Application.EnableVisualStyles();
        Application.Run(window);
    }
}
