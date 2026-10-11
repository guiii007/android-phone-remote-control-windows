$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot=Split-Path $PSScriptRoot -Parent
function Rounded($g,$brush,$x,$y,$w,$h,$radius){
    $path=New-Object System.Drawing.Drawing2D.GraphicsPath
    $d=$radius*2
    $path.AddArc($x,$y,$d,$d,180,90);$path.AddArc($x+$w-$d,$y,$d,$d,270,90)
    $path.AddArc($x+$w-$d,$y+$h-$d,$d,$d,0,90);$path.AddArc($x,$y+$h-$d,$d,$d,90,90);$path.CloseFigure()
    $g.FillPath($brush,$path);$path.Dispose()
}
$images=@()
foreach($size in @(16,24,32,48,64,128,256)){
    $bitmap=New-Object System.Drawing.Bitmap($size,$size)
    $g=[System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode='AntiAlias';$g.ScaleTransform($size/256.0,$size/256.0)
    $dark=New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#12263f'))
    $light=New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#90d8ff'))
    $blue=New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#1e5680'))
    $white=New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#f3faff'))
    $cyan=New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#42b9ec'))
    Rounded $g $dark 8 8 240 240 52;Rounded $g $light 40 50 170 116 14;Rounded $g $blue 51 61 148 94 6
    $pen=New-Object System.Drawing.Pen($light,12);$pen.StartCap='Round';$pen.EndCap='Round'
    $g.DrawLine($pen,104,168,104,189);$g.DrawLine($pen,80,189,128,189);$pen.Dispose()
    Rounded $g $white 151 109 65 110 13;Rounded $g $cyan 160 124 47 70 4;$g.FillEllipse($blue,179.5,203,8,8)
    $pen=New-Object System.Drawing.Pen($white,10);$pen.StartCap='Round';$pen.EndCap='Round';$pen.LineJoin='Round'
    $g.DrawLine($pen,79,101,133,101);$g.DrawLine($pen,120,88,133,101);$g.DrawLine($pen,133,101,120,114)
    $g.DrawLine($pen,130,133,76,133);$g.DrawLine($pen,89,146,76,133);$g.DrawLine($pen,76,133,89,120)
    $pen.Dispose();$g.Dispose()
    $stream=New-Object System.IO.MemoryStream;$bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
    $images+=,[pscustomobject]@{Size=$size;Bytes=$stream.ToArray()}
    $stream.Dispose();$bitmap.Dispose();foreach($brush in @($dark,$light,$blue,$white,$cyan)){$brush.Dispose()}
}
$output=Join-Path $taskRoot 'assets/palm-remote.ico'
$stream=[System.IO.File]::Create($output);$writer=New-Object System.IO.BinaryWriter($stream)
try{
    $writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$images.Count)
    $offset=6+16*$images.Count
    foreach($item in $images){
        $dimension=if($item.Size -eq 256){0}else{$item.Size}
        $writer.Write([byte]$dimension);$writer.Write([byte]$dimension);$writer.Write([byte]0);$writer.Write([byte]0)
        $writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$item.Bytes.Length);$writer.Write([uint32]$offset)
        $offset+=$item.Bytes.Length
    }
    foreach($item in $images){$writer.Write([byte[]]$item.Bytes)}
}finally{$writer.Dispose();$stream.Dispose()}
Write-Output $output
