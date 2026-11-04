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
$s.TargetPath = (Get-Command node -ErrorAction Stop).Source
$s.Arguments = '"' + (Join-Path $PSScriptRoot 'start-hidden.js') + '"'
# Minimized: node only opens a console for the instant it takes to start the app in the background
$s.WindowStyle = 7
$s.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$s.Description = 'OnHockey.tv RPC (Discord Rich Presence for onhockey.tv)'
$s.Save()
