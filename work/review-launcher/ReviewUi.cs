using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class ReviewUi
{
    private static readonly string dir=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
    private static readonly string install=dir;
    private static readonly string profile=Path.Combine(dir,"host-"+Guid.NewGuid().ToString("N"));
    private static IEnumerable<Control> All(Control parent)
    {
        foreach(Control child in parent.Controls){yield return child;foreach(var other in All(child))yield return other;}
    }
    private static async Task Until(Func<bool> condition,string label)
    {
        for(int i=0;i<400;i++){if(condition())return;await Task.Delay(100);}
        throw new Exception("Timed out: "+label);
    }
    private static void Same(Form host,IntPtr handle)
    {
        if(host.Handle!=handle || Application.OpenForms.Cast<Form>().Count(f=>f.TopLevel && f.Visible)!=1)
            throw new Exception("Window changed: "+host.Handle+" vs "+handle+" / "+String.Join(" | ",Application.OpenForms.Cast<Form>().Select(f=>f.GetType().Name+"="+f.Text+"/"+f.Visible+"/"+f.TopLevel))+" / "+new StackTrace(true));
    }
    private static Control Dialog(Form host) {return All(host).FirstOrDefault(c=>c.GetType().Name=="GameDialog" && c.Visible);}
    private static Button ButtonOn(Control dialog,string text){return All(dialog).OfType<Button>().Single(b=>b.Text==text);}
    private static ToolStripButton Tool(Form host,string label){return All(host).OfType<ToolStrip>().Single().Items.OfType<ToolStripButton>().Single(x=>x.Text==label);}
    private static void Log(string msg){File.AppendAllText(Path.Combine(dir,"close-ui.log"),msg+"\r\n");}
    private static async Task Run(Form host)
    {
        try
        {
            IntPtr hwnd=host.Handle;
            var assembly=Assembly.LoadFrom(Path.Combine(install,"Poptropica.exe"));
            assembly.GetType("PoptropicaDesktop.EmbeddedGame",true).GetMethod("Attach").Invoke(null,new object[]{host,new string[]{"--offline"}});
            await Until(()=>Dialog(host)!=null,"initial selection");
            Same(host,hwnd);
            var panel=Dialog(host);
            if(panel.AccessibleName!="Automatic island updates?")throw new Exception("Unexpected startup");
            var decline=ButtonOn(panel,"No thanks");
            if(!decline.Focused)throw new Exception("Decline not focused");
            using(var image=new Bitmap(host.Width,host.Height)){
                host.DrawToBitmap(image,new Rectangle(Point.Empty,image.Size));image.Save(Path.Combine(dir,"inline-opt-in.png"));
            }
            decline.PerformClick();
            await Until(()=>Dialog(host)==null && All(host).Any(c=>c.GetType().Name=="WebView2" && c.Visible),"offline player");
            Same(host,hwnd);
            var view=All(host).Single(c=>c.GetType().Name=="WebView2");
            var bar=All(host).OfType<ToolStrip>().Single();
            if(view.PointToScreen(Point.Empty).Y < bar.PointToScreen(new Point(0,bar.Height)).Y)throw new Exception("Toolbar overlaps player");
            var core=(Microsoft.Web.WebView2.Core.CoreWebView2)view.GetType().GetProperty("CoreWebView2").GetValue(view,null);
            if(await core.ExecuteScriptAsync("document.title")!="\"Offline test\"")throw new Exception("Local PHP fixture failed");
            Log("Inline opt-in and offline fixture passed");
            Tool(host,"Settings").PerformClick();
            await Until(()=>Dialog(host)!=null,"settings");
            Same(host,hwnd);
            var setting=All(Dialog(host)).OfType<CheckBox>().Single();
            string file=Path.Combine(profile,@"Profile\automatic-updates");
            if(setting.Checked || File.ReadAllText(file)!="off") throw new Exception("Opt-out failed");
            setting.Checked=true;
            if(File.ReadAllText(file)!="on")throw new Exception("Settings failed to enable");
            setting.Checked=false;
            if(File.ReadAllText(file)!="off")throw new Exception("Settings failed to disable");
            ButtonOn(Dialog(host),"Done").PerformClick();
            await Until(()=>Dialog(host)==null,"settings close");
            Tool(host,"Online").PerformClick();
            await Until(()=>Dialog(host)!=null,"mode confirm");
            Same(host,hwnd);
            ButtonOn(Dialog(host),"Keep playing").PerformClick();
            await Until(()=>Dialog(host)==null && view.Visible,"keep playing");
            int replies=0;
            core.AddWebResourceRequestedFilter("https://poptropica.love/*",Microsoft.Web.WebView2.Core.CoreWebView2WebResourceContext.All);
            core.WebResourceRequested+=delegate(object sender,Microsoft.Web.WebView2.Core.CoreWebView2WebResourceRequestedEventArgs e){
                if(!e.Request.Uri.StartsWith("https://poptropica.love/",StringComparison.Ordinal))return;
                if(e.Request.Uri.EndsWith(".wasm"))return;
                int code=200;
                if(e.Request.Uri=="https://poptropica.love/play/"){replies++;if(replies==1)code=503;}
                var html=new MemoryStream(System.Text.Encoding.UTF8.GetBytes("<title>Online test</title>"));
                e.Response=core.Environment.CreateWebResourceResponse(html,code,code==200?"OK":"Service Unavailable","Content-Type: text/html");
            };
            Tool(host,"Online").PerformClick();
            await Until(()=>Dialog(host)!=null,"switch confirm");ButtonOn(Dialog(host),"Switch").PerformClick();
            await Until(()=>All(host).OfType<Button>().Any(b=>b.Text=="Try again"&&b.Visible),"online error recovery");
            Same(host,hwnd);
            All(host).OfType<Button>().Single(b=>b.Text=="Try again" && b.Visible).PerformClick();
            await Until(()=>view.Visible && replies>=2,"online retry");
            if(await core.ExecuteScriptAsync("document.title")!="\"Online test\"")throw new Exception("Online fixture failed");
            try{using(var tcp=new System.Net.Sockets.TcpClient("127.0.0.1",18743)){throw new Exception("Local PHP survived online mode switch");}}
            catch(System.Net.Sockets.SocketException){}
            Log("Handled online 503, retried successfully and released local server port");
            var game=All(host).OfType<Form>().Single();
            var updater=assembly.GetType("PoptropicaDesktop.BundledUpdater",true);
            var progress=updater.GetMethod("WithProgress",BindingFlags.Static|BindingFlags.NonPublic);
            var finish=new TaskCompletionSource<bool>();
            Func<IProgress<string>,System.Threading.CancellationToken,Task> body=async(report,cancel)=>{
                report.Report("Loading island files");
                using(cancel.Register(()=>finish.TrySetResult(true)))await finish.Task;
            };
            var active=(Task)progress.Invoke(null,new object[]{game,"Updating islands",body});
            await Until(()=>Dialog(host)!=null,"update progress");
            Same(host,hwnd);
            ButtonOn(Dialog(host),"Cancel").PerformClick();
            await active;
            await Until(()=>Dialog(host)==null,"progress closed");
            var style=assembly.GetType("PoptropicaDesktop.GameStyle",true);
            var ask=style.GetMethod("Ask",BindingFlags.Static|BindingFlags.NonPublic);
            var confirmation=(Task<bool>)ask.Invoke(null,new object[]{game,"Couldn't update","Connection unavailable.","OK",null,false});
            await Until(()=>Dialog(host)!=null,"update error"); Same(host,hwnd);
            ButtonOn(Dialog(host),"OK").PerformClick(); await confirmation;
            await Until(()=>Dialog(host)==null,"game restored");
            Tool(host,"Full screen").PerformClick();
            Same(host,hwnd);
            if(host.FormBorderStyle!=FormBorderStyle.None)throw new Exception("Fullscreen didn't target host");
            var toggle=game.GetType().GetMethod("ToggleFull",BindingFlags.Instance|BindingFlags.NonPublic);
            toggle.Invoke(game,null);
            Same(host,hwnd);
            if(host.FormBorderStyle!=FormBorderStyle.Sizable)throw new Exception("Failed to restore");
            Log("PASS: same top-level HWND at opt-in, gameplay, settings, mode confirmation, update progress/cancel/error, fullscreen, restore");            
            var closed=new TaskCompletionSource<bool>();
            core.WebResourceRequested+=delegate(object sender,Microsoft.Web.WebView2.Core.CoreWebView2WebResourceRequestedEventArgs e){
                if(!e.Request.Uri.EndsWith(".wasm"))return;
                host.BeginInvoke((Action)delegate{
                    var files=assembly.GetType("PoptropicaDesktop.BundledAssets").GetField("files",BindingFlags.Static|BindingFlags.NonPublic).GetValue(null);
                    object gate=files.GetType().GetField("gate",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(files);
                    int count;
                    lock(gate){
                        var pending=(System.Collections.IDictionary)files.GetType().GetField("pending",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(files);
                        count=pending.Count;
                    }
                    Log("Closing with pending installed-asset reads: "+count);
                    if(count==0)Environment.ExitCode=1;
                    host.Close();
                    closed.TrySetResult(true);
                });
            };
            await core.ExecuteScriptAsync("setTimeout(()=>fetch('/ruffle/72a20ef1c0b8ceb37720.wasm').catch(()=>{}),20);true");
            if(await Task.WhenAny(closed.Task,Task.Delay(5000))!=closed.Task)throw new Exception("Mid-request close not observed");
        }
        catch(Exception e){Log(e.ToString());Environment.ExitCode=1;}
        finally{host.Close();}
    }
    [STAThread]public static int Main()
    {
        Environment.SetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT",profile);
        AppDomain.CurrentDomain.AssemblyResolve+=delegate(object sender,ResolveEventArgs e){
            string file=Path.Combine(install,new AssemblyName(e.Name).Name+".dll");
            return File.Exists(file)?Assembly.LoadFrom(file):null;
        };
        Application.ThreadException+=delegate(object sender,System.Threading.ThreadExceptionEventArgs e){Log("UI EXCEPTION: "+e.Exception); Environment.ExitCode=1;};
        Application.EnableVisualStyles();
        var host=new Form {Text="Poptropica",ClientSize=new Size(1120,740),ShowInTaskbar=false,StartPosition=FormStartPosition.Manual,Location=new Point(-3000,-3000)};
        host.Shown+=async delegate{await Run(host);};
        using(var context=new ApplicationContext()){
            host.FormClosed+=async delegate{
                await Task.Delay(1600);
                Log("Processed WebView shutdown completions; exit="+Environment.ExitCode);
                context.ExitThread();
            };
            host.Show();
            Application.Run(context);
        }
        return Environment.ExitCode;
    }
}





