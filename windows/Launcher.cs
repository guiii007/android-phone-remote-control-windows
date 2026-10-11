using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class PalmRemoteLauncher {
    [STAThread]
    private static void Main() {
        Application.EnableVisualStyles();
        string root=AppDomain.CurrentDomain.BaseDirectory;
        string script=Path.Combine(root,"scripts","remote-launcher.ps1");
        if(!File.Exists(script)) {
            MessageBox.Show("请把启动程序保留在掌上遥控项目文件夹中，再用桌面快捷方式打开。","掌上遥控");
            return;
        }
        try {
            var info=new ProcessStartInfo {
                FileName=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell\\v1.0\\powershell.exe"),
                Arguments="-NoProfile -STA -ExecutionPolicy Bypass -File \""+script+"\"",
                WorkingDirectory=root,
                UseShellExecute=false,
                CreateNoWindow=true,
                RedirectStandardOutput=true,
                RedirectStandardError=true,
                StandardOutputEncoding=new UTF8Encoding(false),
                StandardErrorEncoding=new UTF8Encoding(false)
            };
            using(var process=new Process {StartInfo=info}) {
                var errors=new StringBuilder();
                process.OutputDataReceived+=(sender,e)=>{};
                process.ErrorDataReceived+=(sender,e)=>{if(e.Data!=null)lock(errors){if(errors.Length<4000)errors.AppendLine(e.Data);}};
                process.Start();
                process.BeginOutputReadLine();process.BeginErrorReadLine();
                process.WaitForExit();
                if(process.ExitCode!=0) {
                    string detail;lock(errors){detail=errors.ToString();}
                    MessageBox.Show("启动失败。\r\n"+detail,"掌上遥控");
                }
            }
        } catch(Exception error) {MessageBox.Show("启动失败："+error.Message,"掌上遥控");}
    }
}
