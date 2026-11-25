using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Threading.Tasks;

namespace PoptropicaDesktop
{
    internal static class GameStyle
    {
        internal static readonly Color Deep = Color.FromArgb(7, 82, 142);
        internal static readonly Color Ocean = Color.FromArgb(19, 159, 253);
        internal static readonly Color Sky = Color.FromArgb(105, 197, 251);
        internal static readonly Color Ink = Color.FromArgb(8, 54, 87);
        internal static readonly Color Gold = Color.FromArgb(255, 213, 93);
        private static readonly PrivateFontCollection letters = new PrivateFontCollection();
        private static readonly FontFamily face = LoadFace("CreativeBlockRegular.ttf");
        private static readonly FontFamily titleFace = LoadFace("CreativeBlock.ttf");

        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
        private static extern int AddFontResourceEx(string path, uint flags, IntPtr reserved);

        private static FontFamily LoadFace(string file)
        {
            string path = Path.Combine(EmbeddedGame.InstallFolder, @"offline\public\cloud\fonts", file);
            if (File.Exists(path))
            {
                try
                {
                    AddFontResourceEx(path, 0x10, IntPtr.Zero);
                    using (var single = new PrivateFontCollection())
                    {
                        single.AddFontFile(path);
                        string name = single.Families[0].Name;
                        letters.AddFontFile(path);
                        foreach (var family in letters.Families)
                            if (family.Name == name) return family;
                    }
                }
                catch (ArgumentException) {}
            }
            return SystemFonts.MessageBoxFont.FontFamily;
        }

        internal static Font Type(float size, bool title = false)
        {
            var family = title ? titleFace : face;
            var style = family.IsStyleAvailable(FontStyle.Regular) ? FontStyle.Regular : FontStyle.Bold;
            return new Font(family, size, style, GraphicsUnit.Point);
        }

        internal static void ButtonStyle(Button button, bool primary)
        {
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderColor = Deep;
            button.FlatAppearance.BorderSize = 2;
            button.UseVisualStyleBackColor = false;
            button.BackColor = primary ? Gold : Color.FromArgb(213, 238, 255);
            button.ForeColor = Ink;
            button.Font = Type(12, true);
            button.Cursor = Cursors.Hand;
            button.AutoSize = true;
            button.Padding = new Padding(8, 2, 8, 2);
        }

        internal static async Task<bool> Ask(Form owner, string title, string body, string action, string cancel = null, bool preferCancel = false)
        {
            using (var dialog = new GameDialog(title, body))
            {
                var decline = cancel == null ? null : dialog.AddAction(cancel, DialogResult.Cancel, false);
                dialog.AddAction(action, DialogResult.OK, true);
                if (preferCancel && decline != null) dialog.DefaultAction = decline;
                return await dialog.Present(owner) == DialogResult.OK;
            }
        }
    }

    internal sealed class GameDialog : UserControl
    {
        private readonly FlowLayoutPanel buttons = new FlowLayoutPanel();
        private readonly Label body = new Label();
        private readonly TaskCompletionSource<DialogResult> result = new TaskCompletionSource<DialogResult>();
        private Button cancelAction;
        internal Button DefaultAction { get; set; }

        internal GameDialog(string title, string description)
        {
            AccessibleName = title;
            Size = new Size(500,242);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = GameStyle.Sky;
            var heading = new Label { Text=title, ForeColor=Color.White, Font=GameStyle.Type(19,true), AutoSize=false, BackColor=Color.Transparent, TextAlign=ContentAlignment.MiddleCenter, Dock=DockStyle.Top, Height=62 };
            body.Text = description;
            body.ForeColor = GameStyle.Ink;
            body.Font = GameStyle.Type(13);
            body.BackColor = Color.Transparent;
            body.Dock = DockStyle.Fill;
            body.Padding = new Padding(22,2,22,2);
            body.TextAlign = ContentAlignment.MiddleCenter;
            buttons.Dock = DockStyle.Bottom;
            buttons.Height = 60;
            buttons.Padding = new Padding(8,2,12,6);
            buttons.FlowDirection = FlowDirection.RightToLeft;
            buttons.BackColor = Color.Transparent;
            Controls.Add(body); Controls.Add(buttons); Controls.Add(heading);
        }

        internal string Body { set { body.Text = value; } }

        internal async Task<DialogResult> Present(Form owner)
        {
            var game = (GameWindow)owner;
            using (var backdrop = new Panel {Dock=DockStyle.Fill, BackColor=Color.FromArgb(7,31,52),TabStop=false})
            {
                backdrop.Controls.Add(this);
                backdrop.Resize += delegate {
                    Location = new Point(Math.Max(0,(backdrop.ClientSize.Width-Width)/2),Math.Max(0,(backdrop.ClientSize.Height-Height)/2));
                };
                EventHandler onClose = delegate { Dismiss(DialogResult.Cancel); };
                game.Disposed += onClose;
                try
                {
                    game.ShowOverlay(backdrop);
                    if(DefaultAction!=null)DefaultAction.Focus();
                    return await result.Task;
                }
                finally
                {
                    game.Disposed -= onClose;
                    if(!IsDisposed)backdrop.Controls.Remove(this);
                    if(!game.IsDisposed)game.HideOverlay(backdrop);
                }
            }
        }

        internal void Dismiss(DialogResult selected)
        {
            if(!result.Task.IsCompleted)result.TrySetResult(selected);
        }

        internal void AddToggle(string label,bool initial,Func<bool,bool> changed)
        {
            var option = new CheckBox { Text=label,Checked=initial,Font=GameStyle.Type(13,true),ForeColor=GameStyle.Ink,BackColor=Color.Transparent,AutoSize=true,Anchor=AnchorStyles.None };
            var row=new TableLayoutPanel { Height=37,Dock=DockStyle.Bottom,ColumnCount=1,RowCount=1,BackColor=Color.Transparent };
            row.Controls.Add(option,0,0);
            Controls.Add(row);
            Controls.SetChildIndex(row,1);
            bool syncing=false;
            option.CheckedChanged+=delegate {
                if(syncing)return;
                bool effective=changed(option.Checked);
                if(effective==option.Checked)return;
                syncing=true;
                option.Checked=effective;
                syncing=false;
            };
        }

        internal Button AddAction(string label, DialogResult selected, bool primary)
        {
            var button = new Button {Text=label};
            GameStyle.ButtonStyle(button,primary);
            buttons.Controls.Add(button);
            if (primary) DefaultAction = button;
            if (selected == DialogResult.Cancel) cancelAction = button;
            if(selected != DialogResult.None)button.Click += delegate { Dismiss(selected); };
            return button;
        }

        protected override bool ProcessCmdKey(ref Message msg,Keys keyData)
        {
            if(keyData==Keys.Escape && cancelAction!=null){cancelAction.PerformClick();return true;}
            if(keyData==Keys.Enter && ActiveControl==null && DefaultAction!=null){DefaultAction.PerformClick();return true;}
            return base.ProcessCmdKey(ref msg,keyData);
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            using (var brush = new LinearGradientBrush(ClientRectangle, GameStyle.Sky, Color.FromArgb(38,157,241), 90f))
                e.Graphics.FillRectangle(brush,ClientRectangle);
            using (var pen=new Pen(GameStyle.Deep,3))
                e.Graphics.DrawRectangle(pen,1,1,Width-3,Height-3);
        }
    }
}

