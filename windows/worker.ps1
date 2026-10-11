param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing, System.Windows.Forms, UIAutomationClient, UIAutomationTypes, WindowsBase
Add-Type -Path (Join-Path $PSScriptRoot 'Desktop.cs') -ReferencedAssemblies System.Drawing,System.Windows.Forms
[PalmDesktop]::Initialize()

function Get-InputFocus {
    try {
        $element = [System.Windows.Automation.AutomationElement]::FocusedElement
        if ($null -eq $element) { return $null }
        $current = $element.Current
        $password = $current.IsPassword
        $editable = $current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -or $current.ControlType -eq [System.Windows.Automation.ControlType]::Document
        $value = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$value)) { $editable = -not $value.Current.IsReadOnly }
        if (-not $editable) { return $null }
        $rect = $current.BoundingRectangle
        $bounds = [PalmDesktop]::Bounds
        if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0) { return $null }
        return @{ id=($element.GetRuntimeId() -join '-'); x=([int]$rect.X - $bounds.Left); y=([int]$rect.Y - $bounds.Top); width=[int]$rect.Width; height=[int]$rect.Height; password=$password }
    } catch { return $null }
}
if ($CheckOnly) {
    $bounds = [PalmDesktop]::Bounds
    @{ ok=$true; width=$bounds.Width; height=$bounds.Height; inputSize='compiled' } | ConvertTo-Json -Compress
    exit
}

try {
    while ($null -ne ($line = [Console]::ReadLine())) {
        $request = $null
        try {
            $request = $line | ConvertFrom-Json
            $result = $null
            switch ($request.action) {
                'snapshot' {
                    $bounds = [PalmDesktop]::Bounds
                    $focus = Get-InputFocus
                    $maxWidth = 1440; $quality = 65
                    if ($request.maxWidth) { $maxWidth = [int]$request.maxWidth }
                    if ($request.quality) { $quality = [long]$request.quality }
                    if ($request.resetFrame) { [PalmDesktop]::ResetFrames() }
                    $image = [PalmDesktop]::Capture($maxWidth,$quality,[int]$request.maxHeight,[bool]$request.incremental)
                    $result = @{ width=$bounds.Width; height=$bounds.Height; focus=$focus; image=$image; changed=[PalmDesktop]::FrameChanged; motionRatio=[PalmDesktop]::MotionRatio }
                    if ($request.incremental) {
                        $result.changed=[PalmDesktop]::CaptureChanged
                        $result.frameVersion=[PalmDesktop]::CaptureVersion
                        $result.patch=@{x=[PalmDesktop]::PatchX;y=[PalmDesktop]::PatchY;width=[PalmDesktop]::PatchWidth;height=[PalmDesktop]::PatchHeight;screenWidth=[PalmDesktop]::PixelWidth;screenHeight=[PalmDesktop]::PixelHeight}
                    }
                }
                'commit-frame' { [PalmDesktop]::CommitFrame([long]$request.version) }
                'move' { [PalmDesktop]::Move($request.x,$request.y) }
                'button' { [PalmDesktop]::Button($request.button,$request.down,$request.x,$request.y) }
                'wheel' { [PalmDesktop]::Wheel($request.delta,$request.x,$request.y) }
                'key' { [PalmDesktop]::Key($request.key) }
                'release' { [PalmDesktop]::Release() }
                'text' {
                    $focus = Get-InputFocus
                    if ($null -ne $focus -and $focus.password) { throw '原型不支持远程输入密码框。' }
                    if ($request.focusId -and ($null -eq $focus -or $focus.id -ne $request.focusId)) { throw '电脑输入焦点已改变，请重新确认目标输入框。' }
                    if ([string]::IsNullOrEmpty($request.text) -or $request.text.Length -gt 4000) { throw '文字长度须在 1 至 4000 字之间。' }
                    [PalmDesktop]::Text($request.text)
                }
                default { throw '未知操作' }
            }
            @{ id=$request.id; ok=$true; result=$result } | ConvertTo-Json -Depth 8 -Compress | ForEach-Object { [Console]::WriteLine($_) }
        } catch {
            @{ id=$request.id; ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) }
        }
    }
} finally { [PalmDesktop]::Release() }
