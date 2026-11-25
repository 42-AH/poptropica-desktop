using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
class Crossplay {
    [STAThread] static void Main(string[] args) {
        Application.EnableVisualStyles();
        var host=new Form();
        var player=new WebView2 {Dock=DockStyle.Fill};
        host.Controls.Add(player);
        host.Shown+=async delegate {
            try{
                var env=await CoreWebView2Environment.CreateAsync(null,args[1]);
                await player.EnsureCoreWebView2Async(env);
                player.CoreWebView2.Navigate(args[0]);
            }catch(Exception e){Console.Error.WriteLine(e.Message);host.Close();}
        };
        Application.Run(host);
    }
}
