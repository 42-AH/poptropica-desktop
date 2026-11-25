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
    private static void Log(string msg){File.AppendAllText(Path.Combine(dir,"online-settings.log"),msg+"\r\n");}
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
            var core=view.GetType().GetProperty("CoreWebView2").GetValue(view,null);
            var evaluate=core.GetType().GetMethod("ExecuteScriptAsync");
            string ready="";
            for(int i=0;i<30;i++){
                ready=await (Task<string>)evaluate.Invoke(core,new object[]{"document.querySelector('iframe')?.contentDocument?.querySelector('ruffle-object,ruffle-player')?.readyState"});
                if(ready=="2")break;
                await Task.Delay(500);
            }
            if(ready!="2")throw new Exception("Offline player never ready");
            Log("Inline opt-in and Ruffle ready in same host");
            Tool(host,"Settings").PerformClick();
            await Until(()=>Dialog(host)!=null,"settings");
            Same(host,hwnd);
            ButtonOn(Dialog(host),"Check for updates").PerformClick();
            await Until(()=>Dialog(host)!=null && (Dialog(host).AccessibleName=="All caught up" || Dialog(host).AccessibleName=="Couldn't update"),"live optional update result");
            Same(host,hwnd);
            var state=Dialog(host);
            Log(state.AccessibleName+" "+String.Join(" ",All(state).OfType<Label>().Select(l=>l.Text)));
            if(state.AccessibleName!="All caught up")throw new Exception("Expected up-to-date result");
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
        Application.EnableVisualStyles();
        var host=new Form {Text="Poptropica",ClientSize=new Size(1120,740),ShowInTaskbar=false,StartPosition=FormStartPosition.Manual,Location=new Point(-3000,-3000)};
        host.Shown+=async delegate{await Run(host);};
        Application.Run(host);
        return Environment.ExitCode;
    }
}
