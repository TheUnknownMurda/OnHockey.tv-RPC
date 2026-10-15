# Adds (or removes with -Remove) the NHL-RPC shortcut in the Windows Startup folder.
param([switch]$Remove)

$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'NHL-RPC.lnk'
if ($Remove) {
    Remove-Item $lnk -ErrorAction SilentlyContinue
    return
}

$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$s.Arguments = '"' + (Join-Path $PSScriptRoot 'start-hidden.vbs') + '"'
$s.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$s.Description = 'NHL-RPC (Discord Rich Presence for onhockey.tv)'
$s.Save()
