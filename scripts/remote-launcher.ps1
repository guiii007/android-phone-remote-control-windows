param([switch]$CheckOnly,[string]$PreviewPath)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskSettings = @{}
$taskSettingsFile = Join-Path $taskRoot '.remote-settings.json'
if (Test-Path -LiteralPath $taskSettingsFile) { $taskSettings = Get-Content -LiteralPath $taskSettingsFile -Raw | ConvertFrom-Json }
$taskPort = if ($env:PORT) { [int]$env:PORT } elseif ($taskSettings.port) { [int]$taskSettings.port } else { 8789 }
if ($taskPort -lt 1 -or $taskPort -gt 65535) { throw '端口应为 1 到 65535 的整数' }
$nodePath = if ($env:NODE_PATH_EXE) { $env:NODE_PATH_EXE } elseif ($taskSettings.nodePath) { $taskSettings.nodePath } else { 'node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) { $nodePath = $nodeCommand.Source }
}
function Get-RemoteHealth {
    $response = $null
    try {
        $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$taskPort/health")
        $request.Proxy = $null; $request.Timeout = 500; $request.ReadWriteTimeout = 500
        $response = $request.GetResponse()
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        try { $result = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        if ($result.service -eq 'palm-remote') { return $result }
    } catch {} finally { if ($response) { $response.Dispose() } }
    return $null
}
function Get-PhoneAddress {
    foreach ($adapter in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($adapter.Name -notmatch 'Tailscale' -and $adapter.Description -notmatch 'Tailscale') { continue }
        foreach ($entry in $adapter.GetIPProperties().UnicastAddresses) {
            if ($entry.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and $entry.Address.ToString().StartsWith('100.')) {
                return ('http://{0}:{1}/' -f $entry.Address,$taskPort)
            }
        }
    }
    return '等待电脑 Tailscale 连接'
}
if ($CheckOnly) {
    @{nodeFound=(Test-Path -LiteralPath $nodePath);address=(Get-PhoneAddress);serviceRunning=($null -ne (Get-RemoteHealth))} | ConvertTo-Json -Compress
    exit
}
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$created = $false
$taskMutex = [System.Threading.Mutex]::new($true,'Local\PalmRemoteLauncher',[ref]$created)
if (-not $created) {
    [System.Windows.Forms.MessageBox]::Show('启动面板已经打开，请在任务栏中找到“掌上遥控”。','掌上遥控') | Out-Null
    $taskMutex.Dispose(); exit
}
$script:ownedProcess = $null
$script:outputTask = $null
$script:errorTask = $null
$form = New-Object System.Windows.Forms.Form
$form.Text = '掌上遥控 · 启动面板'
$form.ClientSize = New-Object System.Drawing.Size(510,330)
$form.StartPosition = 'CenterScreen'; $form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI',10)
function Add-Label($text,$x,$y,$width,$height) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text=$text; $label.Location=New-Object System.Drawing.Point($x,$y); $label.Size=New-Object System.Drawing.Size($width,$height)
    $form.Controls.Add($label); return $label
}
function Add-Button($text,$x,$y,$width) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text=$text; $button.Location=New-Object System.Drawing.Point($x,$y); $button.Size=New-Object System.Drawing.Size($width,38)
    $form.Controls.Add($button); return $button
}
$null=Add-Label '手机远程控制电脑' 20 18 470 28
$statusLabel=Add-Label '正在检查…' 20 53 470 43
$null=Add-Label '手机访问地址（可收藏到手机浏览器）：' 20 100 470 24
$addressBox=New-Object System.Windows.Forms.TextBox
$addressBox.ReadOnly=$true; $addressBox.Location=New-Object System.Drawing.Point(20,130); $addressBox.Size=New-Object System.Drawing.Size(470,30)
$form.Controls.Add($addressBox)
$copyAddress=Add-Button '复制地址' 20 174 110
$copyToken=Add-Button '复制连接密钥' 140 174 140
$startButton=Add-Button '启动远控' 290 174 95
$stopButton=Add-Button '停止远控' 395 174 95
$null=Add-Label "手机：开启 Tailscale → 打开收藏的网址 → 输入密钥。`r`n电脑保持联网、不要休眠；畅连可保持原来的智能分流。`r`n此面板启动的远控：关闭面板即停止，使用时可最小化。" 20 232 470 82
function Update-Panel {
    $health=Get-RemoteHealth
    $addressBox.Text=Get-PhoneAddress
    $startButton.Enabled=($null -eq $health -and ($null -eq $script:ownedProcess -or $script:ownedProcess.HasExited))
    $stopButton.Enabled=($null -ne $script:ownedProcess -and -not $script:ownedProcess.HasExited)
    if ($health) {
        if (-not $health.hostOnline) { $statusLabel.Text='服务已启动，正在准备 Windows 桌面…' }
        elseif ($health.phoneOnline) { $statusLabel.Text='远控已启动 · 手机已连接' }
        else { $statusLabel.Text='远控已启动 · 等待手机连接' }
        if (-not $stopButton.Enabled) { $statusLabel.Text+='（原启动窗口管理）' }
    } elseif ($script:ownedProcess -and -not $script:ownedProcess.HasExited) { $statusLabel.Text='正在启动，请稍等…' }
    elseif ($script:ownedProcess -and $script:ownedProcess.ExitCode -ne 0) {
        $details='';if($script:errorTask -and $script:errorTask.IsCompleted){$details=$script:errorTask.Result.Trim()}
        $statusLabel.Text=if($details){'启动失败：'+$details}else{'启动失败，请确认电脑 Tailscale 已登录，再点启动。'}
    } else { $statusLabel.Text='远控未启动 · 点击“启动远控”' }
    $copyAddress.Enabled=$addressBox.Text.StartsWith('http://')
    $copyToken.Enabled=Test-Path -LiteralPath (Join-Path $taskRoot '.pairing-token')
}
function Start-Remote {
    if (Get-RemoteHealth) { Update-Panel; return }
    if ($script:ownedProcess -and -not $script:ownedProcess.HasExited) { return }
    if (-not (Test-Path -LiteralPath $nodePath)) { $statusLabel.Text='未找到 Node.js，请检查电脑端安装位置。'; return }
    try {
        $info=New-Object System.Diagnostics.ProcessStartInfo
        $info.FileName=$nodePath; $info.Arguments='src/external.mjs'; $info.WorkingDirectory=$taskRoot
        $info.UseShellExecute=$false; $info.CreateNoWindow=$true
        $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
        $info.StandardOutputEncoding=New-Object System.Text.UTF8Encoding($false)
        $info.StandardErrorEncoding=New-Object System.Text.UTF8Encoding($false)
        $script:ownedProcess=New-Object System.Diagnostics.Process
        $script:ownedProcess.StartInfo=$info; $null=$script:ownedProcess.Start()
        $script:outputTask=$script:ownedProcess.StandardOutput.ReadToEndAsync()
        $script:errorTask=$script:ownedProcess.StandardError.ReadToEndAsync()
        Update-Panel
    } catch { $statusLabel.Text='启动失败：'+$_.Exception.Message }
}
function Stop-Remote {
    if ($script:ownedProcess -and -not $script:ownedProcess.HasExited) {
        try {
            $script:ownedProcess.StandardInput.WriteLine('stop')
            $script:ownedProcess.StandardInput.Flush()
            if (-not $script:ownedProcess.WaitForExit(2000)) { $script:ownedProcess.Kill() }
        } catch { $statusLabel.Text='请关闭原远控窗口停止服务。' }
    }
}
$copyAddress.Add_Click({[System.Windows.Forms.Clipboard]::SetText($addressBox.Text)})
$copyToken.Add_Click({
    try { $key=[System.IO.File]::ReadAllText((Join-Path $taskRoot '.pairing-token')).Trim();[System.Windows.Forms.Clipboard]::SetText($key);$statusLabel.Text='连接密钥已复制，请只粘贴到自己的手机。' }
    catch { $statusLabel.Text='暂时无法读取密钥，请先启动远控。' }
})
$startButton.Add_Click({Start-Remote})
$stopButton.Add_Click({Stop-Remote;Update-Panel})
$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=2000; $timer.Add_Tick({Update-Panel})
if (-not $PreviewPath) { $form.Add_Shown({Update-Panel;Start-Remote;$timer.Start()}) }
$form.Add_FormClosing({$timer.Stop();Stop-Remote})
try {
    if ($PreviewPath) {
        Update-Panel
        $form.Show();$form.Refresh()
        $bitmap=New-Object System.Drawing.Bitmap($form.Width,$form.Height)
        try { $form.DrawToBitmap($bitmap,(New-Object System.Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save($PreviewPath) }
        finally { $bitmap.Dispose() }
    } else { [System.Windows.Forms.Application]::Run($form) }
}
finally { $timer.Dispose();$taskMutex.ReleaseMutex();$taskMutex.Dispose();if($script:ownedProcess){$script:ownedProcess.Dispose()};$form.Dispose() }
