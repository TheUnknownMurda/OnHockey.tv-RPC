# Adds (or removes with -Remove) the OnHockey.tv RPC shortcut in the Windows Startup folder.
param([switch]$Remove)

$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'OnHockey.tv RPC.lnk'
# Shortcut from versions published under the old name (NHL-RPC)
Remove-Item (Join-Path $startup 'NHL-RPC.lnk') -ErrorAction SilentlyContinue
if ($Remove) {
    Remove-Item $lnk -ErrorAction SilentlyContinue
    return
}

$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$s.Arguments = '"' + (Join-Path $PSScriptRoot 'start-hidden.vbs') + '"'
$s.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$s.Description = 'OnHockey.tv RPC (Discord Rich Presence for onhockey.tv)'
$s.Save()
