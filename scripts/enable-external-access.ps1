param(
    [Parameter(Mandatory=$true)][string]$PhoneIP,
    [string]$ComputerIP,
    [string]$NodePath,
    [int]$Port
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$resultFolder = Join-Path $taskRoot 'artifacts'
$null = New-Item -ItemType Directory -Path $resultFolder -Force
$resultPath = Join-Path $resultFolder 'external-firewall-result.json'
try {
    $settings = @{}
    $settingsFile = Join-Path $taskRoot '.remote-settings.json'
    if (Test-Path -LiteralPath $settingsFile) { $settings = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json }
    if (-not $Port) { $Port = if ($env:PORT) { [int]$env:PORT } elseif ($settings.port) { [int]$settings.port } else { 8789 } }
    if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid port.' }
    if (-not $NodePath) { $NodePath = if ($env:NODE_PATH_EXE) { $env:NODE_PATH_EXE } elseif ($settings.nodePath) { $settings.nodePath } else { (Get-Command node.exe -ErrorAction Stop).Source } }
    if (-not (Test-Path -LiteralPath $NodePath)) { throw 'Node.js executable was not found.' }
    if (-not $ComputerIP) { $ComputerIP = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Tailscale' -and $_.IPAddress.StartsWith('100.') } | Select-Object -First 1 -ExpandProperty IPAddress }
    foreach ($address in @($ComputerIP,$PhoneIP)) {
        $parsed = [System.Net.IPAddress]::Parse($address); $bytes = $parsed.GetAddressBytes()
        if ($bytes.Length -ne 4 -or $bytes[0] -ne 100 -or $bytes[1] -lt 64 -or $bytes[1] -gt 127) { throw 'Use the computer and phone Tailscale IPv4 addresses.' }
    }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrator approval is required for the firewall rule.'
    }
    $ruleName = "PalmRemote-Tailscale-Phone-$Port"
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($existing) { Remove-NetFirewallRule -Name $ruleName }
    New-NetFirewallRule -Name $ruleName -DisplayName "Palm Remote - paired Tailscale phone TCP $Port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -LocalAddress $ComputerIP -RemoteAddress $PhoneIP -Profile Any -Program $NodePath | Out-Null
    @{ok=$true; computerIP=$ComputerIP; phoneIP=$PhoneIP; port=$Port} | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
} catch {
    @{ok=$false; error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
    exit 1
}
