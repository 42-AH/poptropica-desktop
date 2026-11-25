using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Reflection;
internal sealed class GamePackage:IDisposable {
 internal readonly string Cache=Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location),"older");
 internal void Extract(string path,CancellationToken token,Action<string,int> report){}
 public void Dispose(){}
}
class UpgradeTest {
 static string dir=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
 static IEnumerable<Control> All(Control c){foreach(Control n in c.Controls){yield return n;foreach(var child in All(n))yield return child;}}
 static async Task Until(Func<bool> condition,string description){for(int i=0;i<300;i++){if(condition())return;await Task.Delay(100);}throw new Exception(description);}
 static Control Dialog(Form host){return All(host).FirstOrDefault(c=>c.GetType().Name=="GameDialog" && c.Visible);}
 static Button Button(Control root,string name){return All(root).OfType<Button>().Single(b=>b.Text==name);}
 static async Task Check(Form host,string mode){
   var hwnd=host.Handle; File.AppendAllText(Path.Combine(dir,"trace.log"),mode+" shown\n");
   string qa=Environment.GetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT");
   try{
     if(mode=="baseline"){await Until(()=>Dialog(host)!=null,"First-run choice missing"); Button(Dialog(host),"No thanks").PerformClick();}
     await Until(()=>All(host).Any(c=>c.GetType().Name=="WebView2" && c.Visible),"No player window");
     var inner=All(host).Single(c=>c.GetType().Name=="GameWindow");
     var version=inner.GetType().Assembly.GetName().Version.ToString();
     string expected=mode=="updated" ? "1.1.0.0":"1.0.99.0";
     if(version!=expected)throw new Exception("Expected "+expected+"; running "+version);
     if(mode=="enable"){
       var settings=All(host).OfType<ToolStrip>().Single().Items.OfType<ToolStripButton>().Single(b=>b.Text=="Settings");
       File.AppendAllText(Path.Combine(dir,"trace.log"),"settings\n");settings.PerformClick();await Until(()=>Dialog(host)!=null,"Settings missing");
       All(Dialog(host)).OfType<CheckBox>().Single().Checked=true;
       File.AppendAllText(Path.Combine(dir,"trace.log"),"checked\n");Button(Dialog(host),"Done").PerformClick();
       await Until(()=>File.Exists(Path.Combine(qa,@"PlayerReleases\v1\next.pack")),"Release did not stage");
     }
     if(mode=="updated")await Until(()=>File.Exists(Path.Combine(qa,@"PlayerReleases\v1\current.pack")),"Player did not commit");
     if(host.Handle!=hwnd||Application.OpenForms.Cast<Form>().Count(f=>f.TopLevel&&f.Visible)!=1)throw new Exception("Window replaced");
     File.WriteAllText(Path.Combine(qa,"ready"),mode+" "+version);
     await Until(()=>File.Exists(Path.Combine(qa,"finish")),"Guest save validation timed out");
   }catch(Exception e){File.WriteAllText(Path.Combine(qa,"error"),e.ToString());Environment.ExitCode=1;}
   finally{host.Close();}
 }
 [STAThread]static void Main(string[] args){
   Application.EnableVisualStyles();WebRequest.DefaultWebProxy=new WebProxy("http://127.0.0.1:19177",true);
   var host=new GameHost(new GamePackage(),new[]{"--offline"},null);
   host.Shown+=async delegate{await Check(host,args[0]);};
   Application.Run(host);File.AppendAllText(Path.Combine(dir,"trace.log"),args[0]+" main exited "+Environment.ExitCode+"\n");
 }
}
