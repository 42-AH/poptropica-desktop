using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Text;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using PoptropicaDesktop;

internal sealed class GameHost : Form
{
    private readonly GamePackage package;
    private readonly string[] arguments;
    private readonly Panel card = new Panel();
    private readonly PictureBox wordmark=new PictureBox();
    private readonly Label status = new Label();
    private readonly Panel progress = new Panel();
    private readonly Panel fill = new Panel();
    private readonly Button action = new Button();
    private readonly PrivateFontCollection fonts = new PrivateFontCollection();
    private readonly CancellationTokenSource cancellation = new CancellationTokenSource();
    private IntPtr fontMemory;
    private IntPtr gdiFont;
    private bool working;
    private int last = -1;
    internal bool Started;

    [DllImport("gdi32.dll")]
    private static extern IntPtr AddFontMemResourceEx(IntPtr memory, uint length, IntPtr reserved, ref uint installed);
    [DllImport("gdi32.dll")]
    private static extern bool RemoveFontMemResourceEx(IntPtr handle);

    internal GameHost(GamePackage package, string[] args, string problem)
    {
        this.package = package;
        arguments = args;
        Text = "Poptropica";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(680,480);
        ClientSize = new Size(1120,740);
        KeyPreview = true;
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Color.FromArgb(7,82,142);
        FontFamily face = LoadGameFont();
        using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("PoptropicaWordmark"))
        using(var source=Image.FromStream(stream))wordmark.Image=new Bitmap(source);
        wordmark.SizeMode=PictureBoxSizeMode.Zoom;
        wordmark.AccessibleName="Poptropica";
        status.TextAlign = ContentAlignment.MiddleCenter;
        status.Font = new Font(face,12);
        status.ForeColor = Color.White;
        status.Text = "Opening Poptropica";
        status.SetBounds(15,84,400,46);
        progress.BackColor = Color.FromArgb(8,54,87);
        progress.SetBounds(55,141,320,14);
        fill.Dock = DockStyle.Left;
        fill.Width = 0;
        fill.BackColor = Color.FromArgb(255,213,93);
        progress.Controls.Add(fill);
        action.Text = "Cancel";
        action.Font = new Font(face,12);
        action.FlatStyle = FlatStyle.Flat;
        action.FlatAppearance.BorderColor = Color.White;
        action.BackColor = Color.FromArgb(19,143,221);
        action.ForeColor = Color.White;
        action.SetBounds(162,177,106,37);
        action.Click += delegate { if (working) Cancel(); else Close(); };
        card.Size = new Size(430,226);
        card.Controls.AddRange(new Control[]{wordmark,status,progress,action});
        Controls.Add(card);
        CenterCard();
        ClientSizeChanged += delegate { if (!card.IsDisposed && card.Visible) CenterCard(); };
        if (problem == null)
        {
            working = true;
            Shown += Start;
        }
        else ShowProblem(problem);
        FormClosing += delegate(object sender,FormClosingEventArgs e){
            if (working) {e.Cancel=true;Cancel();}
        };
    }

    private void CenterCard()
    {
        if(card.IsDisposed || ClientSize.Width<1)return;
        float scale;
        using(var graphics=CreateGraphics())scale=graphics.DpiX/96f;
        int margin=(int)(24*scale);
        int width=Math.Max(1,Math.Min((int)(570*scale),ClientSize.Width-margin*2));
        int logoWidth=Math.Min(width,(int)(440*scale));
        int logoHeight=logoWidth/4;
        wordmark.SetBounds((width-logoWidth)/2,0,logoWidth,logoHeight);
        var measured=TextRenderer.MeasureText(status.Text,status.Font,new Size(width,Int32.MaxValue),TextFormatFlags.WordBreak);
        status.SetBounds(0,logoHeight+margin,width,measured.Height+(int)(12*scale));
        int track=Math.Min(width,(int)(316*scale));
        progress.SetBounds((width-track)/2,status.Bottom+(int)(8*scale),track,(int)(12*scale));
        fill.Width=Math.Max(0,progress.ClientSize.Width*last/100);
        var text=TextRenderer.MeasureText(action.Text,action.Font);
        int buttonWidth=Math.Min(width,Math.Max((int)(120*scale),text.Width+margin*2));
        action.SetBounds((width-buttonWidth)/2,(progress.Visible?progress.Bottom:status.Bottom)+margin,buttonWidth,text.Height+(int)(18*scale));
        card.Size=new Size(width,action.Bottom);
        card.Location=new Point((ClientSize.Width-width)/2,Math.Max(0,(ClientSize.Height-card.Height)/2));
    }

    private FontFamily LoadGameFont()
    {
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("GameFont"))
        {
            if (stream == null) return FontFamily.GenericSansSerif;
            using (var reader = new BinaryReader(stream))
            {
                byte[] bytes = reader.ReadBytes((int)stream.Length);
                fontMemory = Marshal.AllocCoTaskMem(bytes.Length);
                Marshal.Copy(bytes,0,fontMemory,bytes.Length);
                uint installed = 0;
                gdiFont = AddFontMemResourceEx(fontMemory,(uint)bytes.Length,IntPtr.Zero,ref installed);
                fonts.AddMemoryFont(fontMemory,bytes.Length);
                return fonts.Families[0];
            }
        }
    }

    private void ShowProblem(string text)
    {
        working = false;
        card.Visible = true;
        card.BringToFront();
        status.Text = text;
        status.Height = Math.Max(48,TextRenderer.MeasureText(text,status.Font,new Size(status.Width,0),TextFormatFlags.WordBreak).Height+12);
        progress.Visible = false;
        action.Text = "Close";
        action.Enabled = true;
        action.Top = status.Bottom+20;
        card.Height = action.Bottom+12;
        CenterCard();
        AcceptButton = action;
        CancelButton = action;
    }

    private void Cancel()
    {
        action.Enabled = false;
        status.Text = "Canceling…";
        cancellation.Cancel();
    }

    private async void Start(object sender,EventArgs e)
    {
        try
        {
            await Task.Run(()=>package.Extract(package.Cache,cancellation.Token,delegate(string text,int value){
                if (value == last) return;
                last=value;
                BeginInvoke((MethodInvoker)delegate {
                    if (!cancellation.IsCancellationRequested) {if(status.Text!=text){status.Text=text;CenterCard();}fill.Width=progress.ClientSize.Width*value/100;}
                });
            }));
            cancellation.Token.ThrowIfCancellationRequested();
            AppDomain.CurrentDomain.AssemblyResolve += ResolveGameDependency;
            AppDomain.CurrentDomain.SetData("Poptropica.InstallFolder",package.Cache);
            StartInstalledPlayer();
            working = false;
            Started = true;
        }
        catch(OperationCanceledException) {working=false;Close();}
        catch(Exception error) {ShowProblem(error.GetBaseException().Message);}
    }

    private void StartInstalledPlayer()
    {
        string original=Path.Combine(package.Cache,"Poptropica.exe");
        Version bundled=AssemblyName.GetAssemblyName(original).Version;
        byte[] currentBytes, nextBytes, backupBytes;
        var current=PlayerRelease.Read("current.pack",out currentBytes);
        var next=PlayerRelease.Read("next.pack",out nextBytes);
        var trial=Path.Combine(PlayerRelease.Store,"trial");
        if(next!=null && next.Version>bundled && (current==null || next.Version>current.Version))
        {
            try
            {
                bool interrupted=File.Exists(trial) && File.ReadAllText(trial)==next.Hash;
                if(!interrupted)
                {
                    File.WriteAllText(trial,next.Hash);
                    AppDomain.CurrentDomain.SetData("Poptropica.PlayerReady",(Action)delegate { ConfirmPlayer(next.Hash,trial); });
                    if(TryAttach(next,nextBytes))
                    {
                        FormClosed+=delegate { ClearTrial(trial,next.Hash); };
                        return;
                    }
                }
                File.Delete(Path.Combine(PlayerRelease.Store,"next.pack"));
                ClearTrial(trial,next.Hash);
            }
            catch(IOException) {}
            catch(UnauthorizedAccessException) {}
            AppDomain.CurrentDomain.SetData("Poptropica.PlayerReady",null);
        }
        if(current!=null && current.Version>bundled && TryAttach(current,currentBytes))return;
        var backup=PlayerRelease.Read("previous.pack",out backupBytes);
        if(backup!=null && backup.Version>bundled && TryAttach(backup,backupBytes))return;
        Attach(Assembly.LoadFrom(original));
    }

    private void ConfirmPlayer(string hash,string trial)
    {
        AppDomain.CurrentDomain.SetData("Poptropica.PlayerReady",null);
        try
        {
            byte[] unused;
            var pending=PlayerRelease.Read("next.pack",out unused);
            if(pending==null || pending.Hash!=hash)return;
            string from=Path.Combine(PlayerRelease.Store,"next.pack"), to=Path.Combine(PlayerRelease.Store,"current.pack");
            if(File.Exists(to)) File.Replace(from,to,Path.Combine(PlayerRelease.Store,"previous.pack"));
            else File.Move(from,to);
            ClearTrial(trial,hash);
        }
        catch(IOException) {}
        catch(UnauthorizedAccessException) {}
    }

    private static void ClearTrial(string trial,string hash)
    {
        try { if(File.Exists(trial) && File.ReadAllText(trial)==hash)File.Delete(trial); }
        catch(IOException) {}
        catch(UnauthorizedAccessException) {}
    }

    private bool TryAttach(PlayerRelease release,byte[] bytes)
    {
        try
        {
            var assembly=Assembly.Load(bytes);
            if(assembly.GetName().Name!="Poptropica" || assembly.GetName().Version!=release.Version)return false;
            Attach(assembly);
            return true;
        }
        catch(Exception)
        {
            foreach(Control child in new System.Collections.Generic.List<Control>(GetPlayerControls()))child.Dispose();
            card.Visible=true;
            return false;
        }
    }

    private System.Collections.Generic.IEnumerable<Control> GetPlayerControls()
    {
        foreach(Control child in Controls)if(child!=card)yield return child;
    }

    private void Attach(Assembly launcher)
    {
        MethodInfo attach=launcher.GetType("PoptropicaDesktop.EmbeddedGame",true).GetMethod("Attach",new[]{typeof(Form),typeof(string[])});
        if(attach==null)throw new InvalidDataException("The player is incomplete.");
        card.Visible=false;
        attach.Invoke(null,new object[]{this,arguments});
    }

    private Assembly ResolveGameDependency(object sender,ResolveEventArgs args)
    {
        string name = new AssemblyName(args.Name).Name;
        if (name!="Microsoft.Web.WebView2.Core" && name!="Microsoft.Web.WebView2.WinForms") return null;
        return Assembly.LoadFrom(Path.Combine(package.Cache,name+".dll"));
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;
        AppDomain.CurrentDomain.AssemblyResolve -= ResolveGameDependency;
        if(wordmark.Image!=null)wordmark.Image.Dispose();
        fonts.Dispose();
        if (gdiFont != IntPtr.Zero) RemoveFontMemResourceEx(gdiFont);
        if (fontMemory != IntPtr.Zero) Marshal.FreeCoTaskMem(fontMemory);
        gdiFont = IntPtr.Zero;
        fontMemory = IntPtr.Zero;
    }
}

internal static class PackageEntry
{
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr handle,int state);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr handle);

    [STAThread]
    private static int Main(string[] args)
    {
        bool extract = args.Length == 2 && args[0] == "--extract-to";
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        GamePackage package = null;
        string problem = null;
        try { package = new GamePackage(); }
        catch(Exception error) { problem=error.Message; }
        using(package)
        {
            if (extract)
            {
                if (package == null) return 1;
                try {package.Extract(args[1],CancellationToken.None,delegate{});return 0;}
                catch {return 1;}
            }
            bool first;
            using(var singleton = new Mutex(true,@"Local\PoptropicaLoveDesktop",out first))
            {
                if (!first)
                {
                    using (var self = Process.GetCurrentProcess())
                    foreach (var other in Process.GetProcessesByName(self.ProcessName))
                    {
                        using (other)
                        {
                            if (other.Id==self.Id || other.MainWindowHandle==IntPtr.Zero) continue;
                            if (IsIconic(other.MainWindowHandle)) ShowWindow(other.MainWindowHandle,9);
                            SetForegroundWindow(other.MainWindowHandle);
                            break;
                        }
                    }
                    return 0;
                }
                using(var window=new GameHost(package,args,problem))
                {
                    Application.Run(window);
                    return window.Started ? 0 : 1;
                }
            }
        }
    }
}
