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

        internal static GraphicsPath Rounded(Rectangle bounds, int radius)
        {
            var path = new GraphicsPath();
            int size = Math.Max(1, Math.Min(radius * 2, Math.Min(bounds.Width, bounds.Height)));
            path.AddArc(bounds.Left, bounds.Top, size, size, 180, 90);
            path.AddArc(bounds.Right-size, bounds.Top, size, size, 270, 90);
            path.AddArc(bounds.Right-size, bounds.Bottom-size, size, size, 0, 90);
            path.AddArc(bounds.Left, bounds.Bottom-size, size, size, 90, 90);
            path.CloseFigure();
            return path;
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

    internal sealed class GameButton : Button
    {
        private bool hovered;
        private bool pressed;

        internal GameButton()
        {
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Font = GameStyle.Type(12, true);
            Cursor = Cursors.Hand;
            AutoSize = true;
            Padding = new Padding(10, 4, 10, 4);
            MinimumSize = new Size(84, 40);
            SetStyle(ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        }

        protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); hovered=true; Invalidate(); }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); hovered=false; Invalidate(); }
        protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); pressed=e.Button==MouseButtons.Left; Invalidate(); }
        protected override void OnMouseUp(MouseEventArgs e) { base.OnMouseUp(e); pressed=false; Invalidate(); }
        protected override void OnMouseCaptureChanged(EventArgs e) { base.OnMouseCaptureChanged(e); if(!Capture)pressed=false; Invalidate(); }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (Width<4 || Height<4) return;
            using (var path=GameStyle.Rounded(ClientRectangle,10))
            {
                var old=Region;
                Region=new Region(path);
                if(old!=null)old.Dispose();
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var rect=Rectangle.Inflate(ClientRectangle,-1,-1);
            if(rect.Width<2 || rect.Height<2)return;
            var top=Enabled ? (hovered ? Color.FromArgb(132,209,255) : Color.FromArgb(103,186,251)) : Color.LightSlateGray;
            var bottom=Enabled ? (pressed ? GameStyle.Deep : Color.FromArgb(24,128,216)) : Color.SlateGray;
            e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
            using(var path=GameStyle.Rounded(rect,10))
            using(var brush=new LinearGradientBrush(rect,top,bottom,90f))
            using(var edge=new Pen(GameStyle.Deep,2))
            {
                e.Graphics.FillPath(brush,path);
                e.Graphics.DrawPath(edge,path);
            }
            var textBounds=ClientRectangle;
            if(pressed)textBounds.Offset(0,1);
            const TextFormatFlags flags=TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine;
            textBounds.Offset(0,1);
            TextRenderer.DrawText(e.Graphics,Text,Font,textBounds,GameStyle.Deep,flags);
            textBounds.Offset(0,-1);
            TextRenderer.DrawText(e.Graphics,Text,Font,textBounds,Color.White,flags);
            if(Focused && ShowFocusCues)
                using(var ring=GameStyle.Rounded(Rectangle.Inflate(rect,-3,-3),7))
                using(var pen=new Pen(GameStyle.Gold,2))e.Graphics.DrawPath(pen,ring);
        }
    }

    internal sealed class GameDialog : UserControl
    {
        private readonly FlowLayoutPanel buttons = new FlowLayoutPanel();
        private readonly Label body = new Label();
        private readonly TaskCompletionSource<DialogResult> result = new TaskCompletionSource<DialogResult>();
        private readonly Label heading;
        private CheckBox option;
        private Button cancelAction;
        internal Button DefaultAction { get; set; }

        internal GameDialog(string title, string description)
        {
            AccessibleName = title;
            Size = new Size(520,252);
            DoubleBuffered = true;
            Padding = new Padding(8);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(38,157,241);
            heading = new Label { Text=title, ForeColor=Color.White, Font=GameStyle.Type(19,true), AutoSize=false, BackColor=Color.Transparent, TextAlign=ContentAlignment.MiddleCenter, Dock=DockStyle.None };
            body.Text = description;
            body.ForeColor = GameStyle.Ink;
            body.Font = GameStyle.Type(13);
            body.BackColor = Color.Transparent;
            body.Dock = DockStyle.None;
            body.Padding = new Padding(22,2,22,2);
            body.TextAlign = ContentAlignment.MiddleCenter;
            buttons.Dock = DockStyle.None;
            buttons.Height = 60;
            buttons.Padding = new Padding(8,2,12,6);
            buttons.FlowDirection = FlowDirection.RightToLeft;
            buttons.BackColor = Color.Transparent;
            Controls.Add(body); Controls.Add(buttons); Controls.Add(heading);
        }

        internal string Body { set { body.Text = value; Arrange(); } }

        private void Arrange()
        {
            var backdrop = Parent as Panel;
            if (backdrop == null || backdrop.ClientSize.Width < 1) return;
            float scale;
            using (var g=CreateGraphics()) scale=g.DpiX/96f;
            int gap=Math.Max(8,(int)(12*scale));
            int width=Math.Min((int)(540*scale),Math.Max(1,backdrop.ClientSize.Width-gap*2));
            int inner=Math.Max(1,width-gap*2);
            int y=gap;
            foreach(var label in new[]{heading,body})
            {
                int available=Math.Max(1,inner-label.Padding.Horizontal);
                var size=TextRenderer.MeasureText(label.Text,label.Font,new Size(available,Int32.MaxValue),TextFormatFlags.WordBreak | TextFormatFlags.TextBoxControl);
                label.SetBounds(gap,y,inner,size.Height+label.Padding.Vertical+gap);
                y=label.Bottom+gap;
            }
            if(option!=null)
            {
                var size=option.GetPreferredSize(Size.Empty);
                option.SetBounds((width-size.Width)/2,y,size.Width,size.Height);
                y=option.Bottom+gap;
            }
            int buttonHeight=buttons.GetPreferredSize(new Size(inner,0)).Height;
            buttons.SetBounds(gap,y,inner,buttonHeight);
            Size=new Size(width,buttons.Bottom+gap);
            Location=new Point(Math.Max(0,(backdrop.ClientSize.Width-width)/2),Math.Max(0,(backdrop.ClientSize.Height-Height)/2));
        }

        internal async Task<DialogResult> Present(Form owner)
        {
            var game = (GameWindow)owner;
            using (var backdrop = new Panel {Dock=DockStyle.Fill, BackColor=GameStyle.Deep,TabStop=false,AutoScroll=true})
            {
                backdrop.Controls.Add(this);
                backdrop.Resize += delegate {
                    Arrange();
                };
                EventHandler onClose = delegate { Dismiss(DialogResult.Cancel); };
                game.Disposed += onClose;
                try
                {
                    game.ShowOverlay(backdrop);
                    Arrange();
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
            option = new CheckBox { Text=label, Checked=initial, Font=GameStyle.Type(13,true), ForeColor=GameStyle.Ink, BackColor=BackColor, FlatStyle=FlatStyle.Flat, Cursor=Cursors.Hand, AutoSize=true, UseVisualStyleBackColor=false };
            Controls.Add(option);
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
            var button = new GameButton {Text=label};
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

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (Width<8 || Height<8)return;
            using(var path=GameStyle.Rounded(ClientRectangle,15))
            {
                var old=Region;
                Region=new Region(path);
                if(old!=null)old.Dispose();
            }
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            if (Width<8 || Height<8)return;
            e.Graphics.Clear(GameStyle.Deep);
            using(var clip=GameStyle.Rounded(ClientRectangle,15))e.Graphics.SetClip(clip);
            using(var fill=new SolidBrush(BackColor))e.Graphics.FillRectangle(fill,ClientRectangle);
            var band=new Rectangle(0,0,Width,Math.Min(Height,62));
            using(var brush=new LinearGradientBrush(band,GameStyle.Sky,BackColor,90f))
                e.Graphics.FillRectangle(brush,band);
            e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
            using(var outer=GameStyle.Rounded(Rectangle.Inflate(ClientRectangle,-1,-1),14))
            using(var inner=GameStyle.Rounded(Rectangle.Inflate(ClientRectangle,-3,-3),12))
            using(var edge=new Pen(Color.FromArgb(8,116,184),2))
            using(var highlight=new Pen(Color.FromArgb(158,224,255),2))
            {
                e.Graphics.DrawPath(edge,outer);
                e.Graphics.DrawPath(highlight,inner);
            }
        }
    }
}
