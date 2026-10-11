$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskSource = Join-Path $taskRoot 'windows\Launcher.cs'
$taskOutput = Join-Path $taskRoot 'PalmRemote.exe'
& (Join-Path $PSScriptRoot 'build-icon.ps1') | Out-Null
$taskCompiler=Join-Path ([System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'csc.exe'
& $taskCompiler /nologo /target:winexe /reference:System.Windows.Forms.dll ('/win32icon:'+(Join-Path $taskRoot 'assets/palm-remote.ico')) ('/out:'+$taskOutput) $taskSource
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed' }
Write-Output $taskOutput
