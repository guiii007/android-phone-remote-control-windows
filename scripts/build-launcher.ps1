$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskSource = Join-Path $taskRoot 'windows\Launcher.cs'
$taskOutput = Join-Path $taskRoot 'PalmRemote.exe'
Add-Type -Path $taskSource -ReferencedAssemblies System.Windows.Forms -OutputAssembly $taskOutput -OutputType WindowsApplication
Write-Output $taskOutput
