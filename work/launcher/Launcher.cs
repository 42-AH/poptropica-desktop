using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32.SafeHandles;

[assembly: AssemblyTitle("Poptropica")]
[assembly: AssemblyDescription("Poptropica desktop player")]
[assembly: AssemblyCompany("poptropica.love")]
[assembly: AssemblyProduct("Poptropica")]
[assembly: AssemblyVersion("1.1.3.0")]
[assembly: AssemblyFileVersion("1.1.3.0")]

namespace PoptropicaDesktop
{
    public static class EmbeddedGame
    {
        internal static readonly string InstallFolder=(string)AppDomain.CurrentDomain.GetData("Poptropica.InstallFolder") ?? Path.GetDirectoryName(typeof(EmbeddedGame).Assembly.Location);

        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
        private static extern IntPtr LoadLibrary(string path);

        public static void Attach(Form host,string[] args)
        {
            string qaRoot=Environment.GetEnvironmentVariable("POPTROPICA_DESKTOP_QA_ROOT");
            AttachWithProfile(host,args,String.IsNullOrEmpty(qaRoot) ? null : Path.Combine(Path.GetFullPath(qaRoot),"Profile"));
        }

        internal static void AttachWithProfile(Form host,string[] args,string profileDirectory)
        {
            if(host==null)throw new ArgumentNullException("host");
            if(LoadLibrary(Path.Combine(InstallFolder,"WebView2Loader.dll"))==IntPtr.Zero)throw new Win32Exception();
            var game=new GameWindow(args ?? new string[0],profileDirectory);
            game.AttachHost(host);
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            using (var singleton = new Mutex(true, @"Local\PoptropicaLoveDesktop", out ownsMutex))
            {
                if (!ownsMutex)
                {
                    foreach (var other in Process.GetProcessesByName(Process.GetCurrentProcess().ProcessName))
                    {
                        using (other)
                        {
                            if (other.Id != Process.GetCurrentProcess().Id && other.MainWindowHandle != IntPtr.Zero)
                            {
                                if (IsIconic(other.MainWindowHandle)) ShowWindow(other.MainWindowHandle, 9);
                                SetForegroundWindow(other.MainWindowHandle);
                                break;
                            }
                        }
                    }
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new GameWindow(args));
            }
        }

        private static bool ownsMutex;
        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
        [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    }

    internal sealed class OfflineServer : IDisposable
    {
        internal const string Origin = "http://127.0.0.1:18743";
        private Process process;
        private SafeFileHandle job;
        private readonly string folder = Path.Combine(EmbeddedGame.InstallFolder, "offline");

        internal async Task Start(CancellationToken cancellation)
        {
            if (process != null && !process.HasExited) return;
            Dispose();
            string php = Path.Combine(folder, @"runtime\php.exe");
            string root = Path.Combine(folder, "public");
            string router = Path.Combine(folder, "router.php");
            if (!File.Exists(php) || !File.Exists(router) || !Directory.Exists(root))
                throw new InvalidOperationException("The local island files are missing. Close Poptropica and open your original game download again.");
            string token = Guid.NewGuid().ToString("N");
            var start = new ProcessStartInfo(php, "-n -S 127.0.0.1:18743 -t \"" + root + "\" \"" + router + "\"");
            start.WorkingDirectory = root;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.EnvironmentVariables["POPTROPICA_DESKTOP_TOKEN"] = token;
            string generation = await Task.Run(() => BundledAssets.ActiveRoot);
            cancellation.ThrowIfCancellationRequested();
            if (generation != null) start.EnvironmentVariables["POPTROPICA_DESKTOP_GENERATION"] = generation;
            job = CreateJobObject(IntPtr.Zero, null);
            if (job.IsInvalid) throw new Win32Exception();
            var limits = new ExtendedLimits();
            limits.Basic.Flags = 0x2000;
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits))) throw new Win32Exception();
            process = Process.Start(start);
            try
            {
                if (!AssignProcessToJobObject(job, process.Handle)) throw new Win32Exception();
                for (int i = 0; i < 50; i++)
                {
                    if (process == null) throw new OperationCanceledException();
                    if (process.HasExited) break;
                    if (await Task.Run(() => IsReady(token))) return;
                    await Task.Delay(100,cancellation);
                }
                throw new InvalidOperationException("The local game server could not start on port 18743. Close any other copy of Poptropica and try again.");
            }
            catch
            {
                Dispose();
                throw;
            }
        }

        private static bool IsReady(string token)
        {
            var request = (HttpWebRequest)WebRequest.Create(Origin + "/__desktop/health");
            request.Proxy = null;
            request.Timeout = 400;
            request.ReadWriteTimeout = 400;
            request.AllowAutoRedirect = false;
            try
            {
                using (var response = request.GetResponse())
                using (var reader = new StreamReader(response.GetResponseStream()))
                {
                    char[] result = new char[token.Length + 1];
                    int count = reader.ReadBlock(result, 0, result.Length);
                    return count == token.Length && new string(result, 0, count) == token;
                }
            }
            catch (WebException) { return false; }
            catch (IOException) { return false; }
        }

        public void Dispose()
        {
            if (job != null) { job.Dispose(); job = null; }
            if (process != null)
            {
                try { if (!process.HasExited) process.Kill(); }
                catch (InvalidOperationException) {}
                catch (Win32Exception) {}
                process.Dispose();
                process = null;
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct BasicLimits
        {
            internal long ProcessTime, JobTime;
            internal uint Flags;
            internal UIntPtr MinWorkingSet, MaxWorkingSet;
            internal uint ActiveProcesses;
            internal UIntPtr Affinity;
            internal uint PriorityClass, SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ExtendedLimits
        {
            internal BasicLimits Basic;
            internal ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
            internal UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
        }

        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        private static extern SafeFileHandle CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError=true)] private static extern bool SetInformationJobObject(SafeFileHandle job, int kind, ref ExtendedLimits limits, uint size);
        [DllImport("kernel32.dll", SetLastError=true)] private static extern bool AssignProcessToJobObject(SafeFileHandle job, IntPtr process);
    }

    internal sealed class GameWindow : Form
    {
        internal const string OnlineOrigin = "https://poptropica.love";
        private readonly string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Poptropica.love", "Desktop");
        private readonly OfflineServer server = new OfflineServer();
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private readonly WebView2 view = new WebView2();
        private readonly ToolStrip bar = new ToolStrip();
        private readonly ToolStripButton online = new ToolStripButton("Online");
        private readonly ToolStripButton offline = new ToolStripButton("Offline");
        private readonly ToolStripButton settings = new ToolStripButton("Settings");
        private readonly ToolStripLabel updateStatus = new ToolStripLabel();
        private CancellationTokenSource automaticCheck;
        private bool automaticEnabled;
        private readonly ToolStripButton full = new ToolStripButton("Full screen");
        private readonly Panel message = new Panel();
        private readonly Label heading = new Label();
        private readonly Label detail = new Label();
        private readonly Button retry = new GameButton();
        private bool local, busy, playing, fullScreen;
        private ulong navigation;
        private Form hostWindow;
        private TableLayoutPanel layout;
        private Rectangle restoredBounds;
        private FormWindowState restoredState;
        private readonly Color ink = Color.White;
        private readonly Color navy = GameStyle.Deep;

        internal GameWindow(string[] args, string profileDirectory = null)
        {
            if (profileDirectory != null) data = profileDirectory;
            Text = "Poptropica";
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            BackColor = navy;
            Font = GameStyle.Type(12);
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(1120, 740);
            MinimumSize = new Size(680, 480);
            try { local = File.ReadAllText(Path.Combine(data, "play-mode")).Trim() == "offline"; }
            catch (IOException) {}
            catch (UnauthorizedAccessException) {}
            if (Array.IndexOf(args, "--offline") >= 0) local = true;
            if (Array.IndexOf(args, "--online") >= 0) local = false;
            bar.GripStyle = ToolStripGripStyle.Hidden;
            bar.Padding = new Padding(10, 3, 8, 3);
            bar.BackColor = navy;
            bar.ForeColor = ink;
            bar.Font = Font;
            bar.Renderer = new ModeRenderer();
            foreach (var item in new [] { online, offline, full, settings })
            {
                item.Padding = new Padding(9, 4, 9, 4);
                item.Margin = new Padding(1, 1, 1, 1);
                item.DisplayStyle = ToolStripItemDisplayStyle.Text;
                bar.Items.Add(item);
            }
            settings.Alignment = ToolStripItemAlignment.Right;
            settings.Click += async delegate { await OpenSettings(); };
            updateStatus.Alignment = ToolStripItemAlignment.Right;
            updateStatus.ForeColor = GameStyle.Gold;
            updateStatus.Visible = false;
            bar.Items.Add(updateStatus);
            full.Alignment = ToolStripItemAlignment.Right;
            online.ToolTipText = "Play on poptropica.love";
            offline.ToolTipText = "Play from this computer";
            full.ToolTipText = "Toggle full screen (F11)";
            online.Click += async delegate { await ChangeMode(false); };
            offline.Click += async delegate { await ChangeMode(true); };
            full.Click += delegate { ToggleFull(); };
            view.Dock = DockStyle.Fill;
            view.DefaultBackgroundColor = navy;
            message.Dock = DockStyle.Fill;
            message.BackColor = Color.FromArgb(38,157,241);
            heading.Font = GameStyle.Type(24,true);
            heading.ForeColor = ink;
            heading.TextAlign = ContentAlignment.MiddleCenter;
            detail.ForeColor = GameStyle.Ink;
            detail.Font = GameStyle.Type(14);
            detail.TextAlign = ContentAlignment.TopCenter;
            retry.Text = "Try again";
            retry.Click += async delegate { await StartGame(); };
            message.Controls.AddRange(new Control[] {heading, detail, retry});
            message.Resize += delegate { LayoutMessage(); };
            layout=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=1,RowCount=2,Margin=Padding.Empty,Padding=Padding.Empty};
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
            var playerArea=new Panel {Dock=DockStyle.Fill,Margin=Padding.Empty};
            playerArea.Controls.Add(view);
            playerArea.Controls.Add(message);
            message.BringToFront();
            bar.Dock=DockStyle.Fill;
            bar.Margin=Padding.Empty;
            layout.Controls.Add(bar,0,0);
            layout.Controls.Add(playerArea,0,1);
            Controls.Add(layout);
            ShowMessage("Opening Poptropica", "", false);
            Shown += async delegate { await InitializeUpdates(); if(!IsDisposed) await StartGame(); };
            Disposed += delegate { lifetime.Cancel(); if (automaticCheck != null) automaticCheck.Cancel(); server.Dispose(); lifetime.Dispose(); };
        }

        internal void AttachHost(Form host)
        {
            hostWindow = host;
            TopLevel = false;
            FormBorderStyle = FormBorderStyle.None;
            Dock = DockStyle.Fill;
            host.Controls.Add(this);
            BringToFront();
            host.Text=Text;
            host.FormClosed+=delegate { if(!IsDisposed)Dispose(); };
            Show();
        }

        internal void ShowOverlay(Panel overlay)
        {
            layout.Visible=false;
            Controls.Add(overlay);
            overlay.BringToFront();
        }

        internal void HideOverlay(Panel overlay)
        {
            Controls.Remove(overlay);
            layout.Visible=true;
            if(playing)view.Focus();
        }

        protected override void OnTextChanged(EventArgs e)
        {
            base.OnTextChanged(e);
            if(hostWindow!=null)hostWindow.Text=Text;
        }

        private async Task InitializeUpdates()
        {
            bool? setting = UpdatePreference.Read(data);
            bool enabled = setting ?? await GameStyle.Ask(this,"Automatic updates?", "Download island and player updates automatically? Updates are ready the next time you play. You can change this in Settings.", "Turn on", "No thanks", true);
            if (IsDisposed) return;
            automaticEnabled = enabled;
            if (!setting.HasValue) SavePreference(enabled);
            if (automaticEnabled) StartAutomatic();
        }

        private bool SavePreference(bool enabled)
        {
            try { UpdatePreference.Set(data,enabled); automaticEnabled=enabled; return true; }
            catch (Exception e) {
                if (!(e is IOException || e is UnauthorizedAccessException)) throw;
                automaticEnabled = false;
                SetStatus("Couldn't save settings");
                return false;
            }
        }

        private async void StartAutomatic()
        {
            if(automaticCheck != null || !automaticEnabled) return;
            using(var cancellation=new CancellationTokenSource())
            {
                automaticCheck=cancellation;
                try { await BundledUpdater.Automatic(SetStatus,cancellation.Token); }
                finally { automaticCheck=null; }
            }
        }

        private void SetStatus(string text)
        {
            if(IsDisposed) return;
            updateStatus.Text=text;
            updateStatus.Visible=text.Length!=0;
        }

        private async Task OpenSettings()
        {
            using(var dialog = new GameDialog("Settings","Player " + PlayerUpdates.Running.ToString(3) + " · Updates download when you open Poptropica and take effect the next time you play."))
            {
                bool initiallyEnabled = automaticEnabled;
                dialog.AddToggle("Automatic updates",automaticEnabled,enabled=>{
                    if (!SavePreference(enabled)) dialog.Body="Automatic updates are off for this session. Your Windows account couldn't save this choice.";
                    if (!automaticEnabled && automaticCheck != null) automaticCheck.Cancel();
                    return automaticEnabled;
                });
                var check=dialog.AddAction("Check for updates",DialogResult.Retry,false);
                check.AccessibleDescription="Check for player and island updates now";
                dialog.AddAction("Done",DialogResult.OK,true);
                var choice = await dialog.Present(this);
                if (IsDisposed) return;
                if(choice==DialogResult.Retry)
                {
                    if (!BundledUpdater.PendingRestart) SetStatus("");
                    await BundledUpdater.CheckForUpdates(this);
                    if (BundledUpdater.PendingRestart) SetStatus("Update ready · restart to play");
                }
                else if (!initiallyEnabled && automaticEnabled) StartAutomatic();
            }
        }

        private void LayoutMessage()
        {
            int y = Math.Max(20, message.Height / 2 - 90);
            int width = Math.Min(600, Math.Max(100, message.Width - 40));
            int x = (message.Width - width) / 2;
            heading.SetBounds(x, y, width, 50);
            detail.SetBounds(x, y + 60, width, 65);
            retry.SetBounds((message.Width - 112) / 2, y + 132, 112, 36);
        }

        private void ShowMessage(string title, string text, bool canRetry)
        {
            heading.Text = title;
            detail.Text = text;
            retry.Visible = canRetry;
            message.Visible = true;
            view.Visible = false;
            LayoutMessage();
        }

        private async Task ChangeMode(bool toLocal)
        {
            if (busy || (local == toLocal && playing)) return;
            if (playing && !await GameStyle.Ask(this, "Switch games?", "Leave the current game and play " + (toLocal ? "offline" : "online") + "?", "Switch", "Keep playing")) return;
            local = toLocal;
            await StartGame();
        }

        private async Task StartGame()
        {
            if (busy) return;
            busy = true;
            navigation = 0;
            playing = false;
            online.Checked = !local;
            offline.Checked = local;
            online.AccessibleDescription = local ? "" : "Selected";
            offline.AccessibleDescription = local ? "Selected" : "";
            Text = "Poptropica " + (local ? "· Offline" : "· Online");
            ShowMessage("Opening Poptropica", local ? "Starting the local game…" : "Connecting to poptropica.love…", false);
            try
            {
                Directory.CreateDirectory(data);
                if (view.CoreWebView2 == null)
                {
                    var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(data, "Player"));
                    if (IsDisposed) return;
                    await view.EnsureCoreWebView2Async(env);
                    await view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(@"
                        if (window === window.top && location.pathname === '/play/' &&
                            (location.origin === '" + OnlineOrigin + @"' || location.origin === '" + OfflineServer.Origin + @"')) {
                            document.addEventListener('DOMContentLoaded', () => {
                                const intro = document.querySelector('#account-form > #account-title + p');
                                if (intro) intro.textContent = 'CREATE AN ACCOUNT FOR THIS APP. ONLY YOUR POPTROPICA.LOVE LOGIN WILL WORK HERE';
                            }, {once:true});
                        }");
                    BundledAssets.Attach(view.CoreWebView2);
                    view.CoreWebView2.ContainsFullScreenElementChanged += delegate {
                        if (fullScreen != view.CoreWebView2.ContainsFullScreenElement) ToggleFull();
                    };
                    view.CoreWebView2.Settings.AreDevToolsEnabled = false;
                    view.CoreWebView2.Settings.IsStatusBarEnabled = false;
                    view.CoreWebView2.NavigationCompleted += Finished;
                    view.CoreWebView2.NavigationStarting += Starting;
                    view.CoreWebView2.NewWindowRequested += NewWindow;
                    view.CoreWebView2.ProcessFailed += delegate(object sender, CoreWebView2ProcessFailedEventArgs e) {
                        if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited) {
                            playing = false; busy = false;
                            ShowMessage("Player closed", "Close and reopen Poptropica to restart the player.", false);
                        }
                    };
                    view.KeyDown += delegate(object sender, KeyEventArgs e) {
                        if (e.KeyCode == Keys.F11 || (e.KeyCode == Keys.Escape && fullScreen)) {
                            e.Handled = true;
                            e.SuppressKeyPress = true;
                            ToggleFull();
                        }
                    };
                }
                if (local) await server.Start(lifetime.Token);
                if (IsDisposed) return;
                File.WriteAllText(Path.Combine(data, "play-mode"), local ? "offline" : "online");
                view.CoreWebView2.Navigate((local ? OfflineServer.Origin : OnlineOrigin) + "/play/");
            }
            catch (WebView2RuntimeNotFoundException)
            {
                if (!IsDisposed) ShowMessage("The player needs Microsoft Edge WebView2", "Install the Microsoft Edge WebView2 Evergreen Runtime for Windows, then reopen Poptropica.", true);
            }
            catch (Exception e)
            {
                if (!IsDisposed) ShowMessage("Couldn't open the game", e.Message, true);
            }
            finally { busy = false; }
        }

        private bool GameAddress(string address)
        {
            Uri uri;
            if (!Uri.TryCreate(address, UriKind.Absolute, out uri)) return false;
            return String.Equals(uri.GetLeftPart(UriPartial.Authority), local ? OfflineServer.Origin : OnlineOrigin, StringComparison.OrdinalIgnoreCase);
        }

        private void Starting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            if (GameAddress(e.Uri)) navigation = e.NavigationId;
            else e.Cancel = true;
        }

        private void NewWindow(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            Uri uri;
            if (!e.IsUserInitiated || !Uri.TryCreate(e.Uri, UriKind.Absolute, out uri)) return;
            if (uri.Scheme != "https" && !(local && GameAddress(e.Uri))) return;
            try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); }
            catch (Win32Exception) {}
        }

        private void Finished(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (IsDisposed || e.NavigationId != navigation) return;
            if (e.WebErrorStatus == CoreWebView2WebErrorStatus.OperationCanceled && playing) return;
            if (!e.IsSuccess || e.HttpStatusCode >= 400)
            {
                playing = false;
                ShowMessage(local ? "Couldn't open the offline game" : "Couldn't reach Poptropica", local ? "Restart Poptropica to reopen the local island files, then try again." : "Try connecting again, or choose Offline above to play on this computer.", true);
                return;
            }
            var ready=AppDomain.CurrentDomain.GetData("Poptropica.PlayerReady") as Action;
            if(ready!=null)ready();
            if (!local) server.Dispose();
            playing = true;
            message.Visible = false;
            view.Visible = true;
            view.Focus();
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == Keys.F11) { ToggleFull(); return true; }
            if (keyData == Keys.Escape && fullScreen) { ToggleFull(); return true; }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        private void ToggleFull()
        {
            if(!layout.Visible)return;
            var target=hostWindow ?? this;
            fullScreen = !fullScreen;
            bar.Visible = !fullScreen;
            if (fullScreen)
            {
                restoredState = target.WindowState;
                restoredBounds = target.WindowState == FormWindowState.Normal ? target.Bounds : target.RestoreBounds;
                var monitor = Screen.FromControl(target).Bounds;
                target.WindowState = FormWindowState.Normal;
                target.FormBorderStyle = FormBorderStyle.None;
                target.Bounds = monitor;
            }
            else
            {
                target.FormBorderStyle = FormBorderStyle.Sizable;
                target.Bounds = restoredBounds;
                target.WindowState = restoredState;
            }
        }

        private sealed class ModeRenderer : ToolStripProfessionalRenderer
        {
            protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
            {
                var button = e.Item as ToolStripButton;
                if (button == null) return;
                var color = button.Selected ? Color.FromArgb(34, 134, 206) : button.Checked ? Color.FromArgb(14, 117, 187) : e.ToolStrip.BackColor;
                using (var brush = new SolidBrush(color)) e.Graphics.FillRectangle(brush, new Rectangle(Point.Empty, button.Size));
                if (button.Checked)
                    using (var pen = new Pen(GameStyle.Gold, 2))
                        e.Graphics.DrawLine(pen, 6, button.Height - 1, button.Width - 6, button.Height - 1);
            }

            protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e) {}
        }
    }
}














