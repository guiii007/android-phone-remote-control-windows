using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class PalmDesktop {
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion data; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mouse;
        [FieldOffset(0)] public KEYBDINPUT keyboard;
    }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT {
        public int dx, dy; public uint mouseData, flags, time; public IntPtr extra;
    }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT {
        public ushort vk, scan; public uint flags, time; public IntPtr extra;
    }
    [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, INPUT[] input, int size);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    static bool leftHeld, rightHeld;
    static byte[] previousPreview;
    static byte[] committedPixels,pendingPixels;
    static int committedWidth,committedHeight,pendingWidth,pendingHeight;
    static long captureVersion;
    public static long CaptureVersion { get { return captureVersion; } }
    public static int PatchX { get; private set; }
    public static int PatchY { get; private set; }
    public static int PatchWidth { get; private set; }
    public static int PatchHeight { get; private set; }
    public static int PixelWidth { get; private set; }
    public static int PixelHeight { get; private set; }
    public static bool CaptureChanged { get; private set; }
    public static void ResetFrames(){committedPixels=null;pendingPixels=null;previousPreview=null;}
    public static void CommitFrame(long version){if(version==captureVersion&&pendingPixels!=null){committedPixels=pendingPixels;committedWidth=pendingWidth;committedHeight=pendingHeight;}}
    public static Rectangle ChangedBounds(Bitmap image) {
        int w=image.Width,h=image.Height;PixelWidth=w;PixelHeight=h;
        var data=image.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
        byte[] pixels=new byte[w*h*4];
        try{for(int y=0;y<h;y++)Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),pixels,y*w*4,w*4);}finally{image.UnlockBits(data);}
        pendingPixels=pixels;pendingWidth=w;pendingHeight=h;captureVersion++;
        if(committedPixels==null||committedWidth!=w||committedHeight!=h)return new Rectangle(0,0,w,h);
        int left=w,top=h,right=-1,bottom=-1;
        for(int y=0;y<h;y++)for(int x=0;x<w;x++){
            int i=(y*w+x)*4;
            if(pixels[i]!=committedPixels[i]||pixels[i+1]!=committedPixels[i+1]||pixels[i+2]!=committedPixels[i+2]){left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);}
        }
        if(right<0)return Rectangle.Empty;
        // 包含相邻像素，避免 JPEG 在变化边缘留下接缝。
        left=Math.Max(0,left-2);top=Math.Max(0,top-2);right=Math.Min(w-1,right+2);bottom=Math.Min(h-1,bottom+2);
        return Rectangle.FromLTRB(left,top,right+1,bottom+1);
    }
    public static bool FrameChanged { get; private set; }
    public static double MotionRatio { get; private set; }
    static void MeasureMotion(Bitmap full) {
        const int w=160, h=90;
        byte[] sample=new byte[w*h*3]; int changed=0;
        using(Bitmap preview=new Bitmap(w,h)) {
            using(Graphics g=Graphics.FromImage(preview)) g.DrawImage(full,0,0,w,h);
            for(int y=0;y<h;y++) for(int x=0;x<w;x++) {
                Color c=preview.GetPixel(x,y);int i=(y*w+x)*3;
                sample[i]=c.R;sample[i+1]=c.G;sample[i+2]=c.B;
                if(previousPreview==null || Math.Abs(c.R-previousPreview[i])+Math.Abs(c.G-previousPreview[i+1])+Math.Abs(c.B-previousPreview[i+2])>24) changed++;
            }
        }
        FrameChanged=previousPreview==null || !SameSample(sample,previousPreview);
        MotionRatio=(double)changed/(w*h);previousPreview=sample;
    }
    static bool SameSample(byte[] a,byte[] b) {
        for(int i=0;i<a.Length;i++) if(a[i]!=b[i]) return false;
        return true;
    }
    public static void Initialize() {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { SetProcessDPIAware(); }
    }
    public static Rectangle Bounds { get { return Screen.PrimaryScreen.Bounds; } }
    static void Send(INPUT[] inputs) {
        if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) != inputs.Length)
            throw new InvalidOperationException("Windows 未接受全部操作；请检查目标程序权限和桌面状态。不要自动重试文字输入。");
    }
    public static void Move(int x, int y) {
        Rectangle b = Bounds;
        x = Math.Max(0, Math.Min(b.Width - 1, x)); y = Math.Max(0, Math.Min(b.Height - 1, y));
        if (!SetCursorPos(b.Left + x, b.Top + y)) throw new InvalidOperationException("无法移动鼠标，请确认电脑桌面已解锁。");
    }
    public static void Button(string button, bool down, int x, int y) {
        Move(x, y);
        bool held = button == "left" ? leftHeld : rightHeld;
        if (held == down) return;
        uint flag = button == "left" ? (down ? 0x0002u : 0x0004u) : (down ? 0x0008u : 0x0010u);
        Send(new INPUT[] { new INPUT { type=0, data=new InputUnion { mouse=new MOUSEINPUT { flags=flag } } } });
        if (button == "left") leftHeld=down; else rightHeld=down;
    }
    public static void Release() {
        if (leftHeld) { Send(new INPUT[] { new INPUT { type=0, data=new InputUnion { mouse=new MOUSEINPUT { flags=0x0004u } } } }); leftHeld=false; }
        if (rightHeld) { Send(new INPUT[] { new INPUT { type=0, data=new InputUnion { mouse=new MOUSEINPUT { flags=0x0010u } } } }); rightHeld=false; }
    }
    static INPUT Keyboard(ushort vk, ushort scan, uint flags) {
        return new INPUT { type=1, data=new InputUnion { keyboard=new KEYBDINPUT { vk=vk, scan=scan, flags=flags } } };
    }
    public static void Key(string key) {
        if (key == "ShiftEnter") {
            Send(new INPUT[] { Keyboard(16,0,0), Keyboard(13,0,0), Keyboard(13,0,2u), Keyboard(16,0,2u) });
            return;
        }
        ushort vk;
        switch (key) {
            case "Enter": vk=13; break; case "Backspace": vk=8; break;
            case "Escape": vk=27; break; case "Tab": vk=9; break;
            case "ArrowLeft": vk=37; break; case "ArrowUp": vk=38; break;
            case "ArrowRight": vk=39; break; case "ArrowDown": vk=40; break;
            default: throw new ArgumentException("不支持的按键");
        }
        uint extended = vk >= 37 && vk <= 40 ? 1u : 0u;
        Send(new INPUT[] { Keyboard(vk,0,extended), Keyboard(vk,0,extended|2u) });
    }
    public static void Text(string text) {
        text=text.Replace("\r\n", "\n").Replace("\r", "\n");
        // 每个 UTF-16 单元发送成对的 down/up，避免依赖电脑输入法或改写剪贴板。
        foreach (char c in text) {
            if (c=='\n') Key("Enter");
            else if (c=='\t') Key("Tab");
            else Send(new INPUT[] { Keyboard(0,c,4u), Keyboard(0,c,6u) });
        }
    }
    public static void Wheel(int delta, int x, int y) {
        Move(x,y);
        Send(new INPUT[] { new INPUT { type=0, data=new InputUnion { mouse=new MOUSEINPUT { flags=0x0800u, mouseData=unchecked((uint)delta) } } } });
    }
    public static string Capture(int maxWidth, long quality) { return Capture(maxWidth,quality,0,false); }
    public static string Capture(int maxWidth, long quality,int maxHeight,bool incremental) {
        Rectangle b=Bounds;
        using (Bitmap full=new Bitmap(b.Width,b.Height)) {
            using (Graphics g=Graphics.FromImage(full)) g.CopyFromScreen(b.Left,b.Top,0,0,b.Size);
            MeasureMotion(full);
            int w=Math.Min(Math.Max(320,Math.Min(2560,maxWidth)),b.Width), h=Math.Max(1,(int)Math.Round(b.Height*(double)w/b.Width));
            if(maxHeight>0&&h>maxHeight){w=Math.Max(1,(int)Math.Round(w*(double)maxHeight/h));h=maxHeight;}
            using (Bitmap small=new Bitmap(w,h)) {
                using (Graphics g=Graphics.FromImage(small)) { if(w==b.Width&&h==b.Height)g.DrawImageUnscaled(full,0,0);else{g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBilinear;g.DrawImage(full,0,0,w,h);} }
                Rectangle area=incremental?ChangedBounds(small):new Rectangle(0,0,w,h);
                CaptureChanged=!area.IsEmpty;PatchX=area.X;PatchY=area.Y;PatchWidth=area.Width;PatchHeight=area.Height;
                if(area.IsEmpty)return null;
                using(Bitmap region=small.Clone(area,PixelFormat.Format32bppArgb))
                using (MemoryStream stream=new MemoryStream()) {
                    ImageCodecInfo jpeg=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.MimeType=="image/jpeg");
                    using (EncoderParameters p=new EncoderParameters(1)) {
                        p.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,Math.Max(20L,Math.Min(85L,quality)));
                        region.Save(stream,jpeg,p);
                    }
                    // 静态高清文字优先无损；照片界面 PNG 过大时仍选 JPEG，避免长时间占用链路。
                    byte[] encoded=stream.ToArray();
                    if(quality>=85||incremental)using(MemoryStream png=new MemoryStream()){
                        region.Save(png,System.Drawing.Imaging.ImageFormat.Png);
                        if(png.Length<=encoded.Length*1.25)encoded=png.ToArray();
                    }
                    return Convert.ToBase64String(encoded);
                }
            }
        }
    }
}
