using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;
using System.Text;
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

internal static class HostSmoke
{
    private static readonly string dir=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
    private static readonly string install=Path.GetFullPath(Path.Combine(dir,@"..\assembled"));
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
            throw new Exception("Window changed");
    }
    private static Control Dialog(Form host) {return All(host).FirstOrDefault(c=>c.GetType().Name=="GameDialog" && c.Visible);}
    private static Button ButtonOn(Control dialog,string text){return All(dialog).OfType<Button>().Single(b=>b.Text==text);}
    private static ToolStripButton Tool(Form host,string label){return All(host).OfType<ToolStrip>().Single().Items.OfType<ToolStripButton>().Single(x=>x.Text==label);}
    private static void Log(string msg){File.AppendAllText(Path.Combine(dir,"test.log"),msg+"\r\n");}
    private static async Task Switch(Form host,string mode){
        var inner=All(host).Single(c=>c.GetType().Name=="GameWindow"); var flags=BindingFlags.Instance|BindingFlags.NonPublic; await Until(()=>(bool)inner.GetType().GetField("playing",flags).GetValue(inner) && !(bool)inner.GetType().GetField("busy",flags).GetValue(inner),"ready to switch "+mode); Log("Switching "+mode+" from "+host.Text); Tool(host,mode).PerformClick();
        await Until(()=>Dialog(host)!=null,"switch prompt");
        ButtonOn(Dialog(host),"Switch").PerformClick();
    }
    private static async Task WaitJs(CoreWebView2 core,string expression){
        string answer="";
        for(int i=0;i<180;i++){
            try{answer=await core.ExecuteScriptAsync("Boolean("+expression+")");if(answer=="true")return;}catch{}
            await Task.Delay(100);
        }
        throw new Exception("Timed out: "+expression+" at "+core.Source+" status "+await core.ExecuteScriptAsync("document.getElementById('status')?.textContent+' '+document.getElementById('notice')?.innerText"));
    }
    private static void Fixture(CoreWebView2 core) {
        core.AddWebResourceRequestedFilter("https://poptropica.love/*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=delegate(object sender,CoreWebView2WebResourceRequestedEventArgs e){
            var u=new Uri(e.Request.Uri);
            if(u.Host!="poptropica.love" || u.AbsolutePath.StartsWith("/__desktop/"))return;
            string name=u.AbsolutePath.TrimStart('/');
            if(name.EndsWith("/"))name+="index.html";
            var file=Path.Combine(install,"offline","public",name);
            bool exists=File.Exists(file);
            string mime=name.EndsWith(".mjs")||name.EndsWith(".js")?"text/javascript":name.EndsWith(".html")?"text/html":name.EndsWith(".css")?"text/css":"application/octet-stream";
            byte[] bytes=name=="game/index.html"?Encoding.UTF8.GetBytes("<html></html>"):exists?File.ReadAllBytes(file):new byte[0];
            e.Response=core.Environment.CreateWebResourceResponse(new MemoryStream(bytes),exists?200:404,"Fixture","Content-Type: "+mime);
        };
    }
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
            if(panel.AccessibleName!="Automatic updates?")throw new Exception("Unexpected startup");
            var decline=ButtonOn(panel,"No thanks");
            if(!decline.Focused)throw new Exception("Decline not focused");
            using(var image=new Bitmap(host.Width,host.Height)){
                host.DrawToBitmap(image,new Rectangle(Point.Empty,image.Size));image.Save(Path.Combine(dir,"inline-opt-in.png"));
            }
            decline.PerformClick();
            await Until(()=>Dialog(host)==null && All(host).Any(c=>c.GetType().Name=="WebView2" && c.Visible),"offline player");
            Same(host,hwnd);
            var core=All(host).OfType<WebView2>().Single().CoreWebView2;
            Fixture(core);
            await core.AddScriptToExecuteOnDocumentCreatedAsync(File.ReadAllText(Path.Combine(dir,"fixture.js")));
            const string game="document.querySelector('#player iframe') && ";
            const string active="JSON.parse(localStorage.getItem('poptropica.cloud.workspace.v1'))?.owner";
            const string offline="location.hostname==='127.0.0.1' && ";
            const string online="location.hostname==='poptropica.love' && ";
            await WaitJs(core,game+offline+active+"==='guest'");
            await core.ExecuteScriptAsync("localStorage.setItem(location.hostname+'/guest-proof','AL8AAAAAVENTTwAAAAAAAAAA')");
            await Switch(host,"Online");
            await WaitJs(core,game+online+active+"==='user:41'");
            await Switch(host,"Offline");
            await WaitJs(core,game+offline+active+"==='user:41' && localStorage.getItem(location.hostname+'/initial') && !localStorage.getItem(location.hostname+'/guest-proof')");
            await core.ExecuteScriptAsync("localStorage.setItem(location.hostname+'/offline-one','AL8AAAAAVENTTwAAAAAAAAAA')");
            await Switch(host,"Online");
            await WaitJs(core,game+online+"JSON.parse(localStorage.getItem('fixture-cloud-41'))?.bundle.files['/offline-one']");
            Log("Unchanged cloud automatically accepted the offline save.");
            await Switch(host,"Offline");
            await WaitJs(core,game+offline+active+"==='user:41'");
            await core.ExecuteScriptAsync("localStorage.setItem(location.hostname+'/offline-two','AL8AAAAAVENTTwAAAAAAAAAA')");
            await core.AddScriptToExecuteOnDocumentCreatedAsync("if(location.origin==='https://poptropica.love' && location.pathname==='/play/' && !localStorage.fixtureConflict){localStorage.fixtureConflict='1';let s=JSON.parse(localStorage['fixture-cloud-41']);s.revision++;s.bundle.files['/remote-change']='AL8AAAAAVENTTwAAAAAAAAAA';s.digest='remote-change';localStorage['fixture-cloud-41']=JSON.stringify(s)}");
            await Switch(host,"Online");
            await WaitJs(core,online+"document.querySelector('#notice-actions')?.textContent.includes('Keep this device')");
            await WaitJs(core,"!JSON.parse(localStorage['fixture-cloud-41']).bundle.files['/offline-two']");
            await core.ExecuteScriptAsync("Array.from(document.querySelectorAll('#notice-actions button')).find(b=>b.textContent.includes('Keep this device')).click()");
            await WaitJs(core,game+online+"JSON.parse(localStorage['fixture-cloud-41']).bundle.files['/offline-two']");
            Log("Divergent saves required a choice before uploading.");
            await core.ExecuteScriptAsync("localStorage.fixtureAccount='0';location.reload()");
            await WaitJs(core,game+online+active+"==='guest'");
            await Switch(host,"Offline");
            await WaitJs(core,game+offline+active+"==='guest' && localStorage.getItem(location.hostname+'/guest-proof') && !localStorage.getItem(location.hostname+'/offline-two')");
            Log("Signed-out guest retained the separate original adventure.");
            Same(host,hwnd);
        }
        catch(Exception e){Log(e.ToString()+" "+string.Join("|",All(host).OfType<Label>().Select(x=>x.Text)));Environment.ExitCode=1;}
        finally{host.Close();}
    }
    [STAThread]public static int Main()
    {
        Environment.SetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT",profile);
        AppDomain.CurrentDomain.AssemblyResolve+=delegate(object sender,ResolveEventArgs e){
            string file=Path.Combine(install,new AssemblyName(e.Name).Name+".dll");
            return File.Exists(file)?Assembly.LoadFrom(file):null;
        };
        Application.EnableVisualStyles();
        var host=new Form {Text="Poptropica",ClientSize=new Size(1120,740),ShowInTaskbar=false,StartPosition=FormStartPosition.Manual,Location=new Point(-3000,-3000)};
        host.Shown+=async delegate{await Run(host);};
        Application.Run(host);
        return Environment.ExitCode;
    }
}
