$ErrorActionPreference = "Stop"

$PiDir = if ($env:PI_CODING_AGENT_DIR) { $env:PI_CODING_AGENT_DIR } else { "$env:USERPROFILE\.pi\agent" }
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Copy-ConfigDir($Name) {
  $src = Join-Path $ScriptDir $Name
  $dst = Join-Path $PiDir $Name
  if (Test-Path $src) {
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
    Copy-Item $src $dst -Recurse -Force
  }
}

Write-Host "Setting up sanitized Pi configuration..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $PiDir | Out-Null

Copy-Item "$ScriptDir\settings.json" "$PiDir\settings.json" -Force
Copy-Item "$ScriptDir\mcp.json" "$PiDir\mcp.json" -Force
Copy-Item "$ScriptDir\models.json" "$PiDir\models.json" -Force
Copy-Item "$ScriptDir\auth.example.json" "$PiDir\auth.example.json" -Force
Copy-ConfigDir "extensions"
Copy-ConfigDir "prompts"
Copy-ConfigDir "skills"

# Patch settings.json: Mac shellPath/paths -> Windows.
$SettingsPath = "$PiDir\settings.json"
$txt = Get-Content $SettingsPath -Raw
$txt = $txt -replace '"/bin/zsh"', '"powershell.exe"'
# Use forward slashes inside JSON values so we don't need to double-escape backslashes.
$WinPath = "C:/Users/$env:USERNAME/.pi/agent/"
$txt = $txt -replace '/Users/safzan/\.pi/agent/', $WinPath
Set-Content $SettingsPath $txt -NoNewline
Write-Host "Patched settings.json: shellPath=powershell.exe, agent path=$WinPath" -ForegroundColor Yellow

Write-Host ""
Write-Host "Configuration copied to $PiDir" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Copy $PiDir\auth.example.json to $PiDir\auth.json and fill in real values"
Write-Host "  2. Replace YOUR_MORPH_API_KEY in $PiDir\mcp.json"
Write-Host "  3. Set the API-key providers referenced by $PiDir\models.json with setx"
Write-Host "  4. Install pi if needed: npm i -g @earendil-works/pi-coding-agent"
Write-Host "  5. Run pi; first startup will clone package extensions listed in settings.json"
Write-Host "  6. /login for OAuth providers as needed"
