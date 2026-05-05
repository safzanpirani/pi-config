$ErrorActionPreference = "Stop"

$PiDir = "$env:USERPROFILE\.pi\agent"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Setting up Pi configuration..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$PiDir\extensions" | Out-Null

Copy-Item "$ScriptDir\settings.json" "$PiDir\settings.json" -Force
Copy-Item "$ScriptDir\mcp.json" "$PiDir\mcp.json" -Force
Copy-Item "$ScriptDir\models.json" "$PiDir\models.json" -Force

if (Test-Path "$ScriptDir\extensions") {
  Copy-Item "$ScriptDir\extensions\*" "$PiDir\extensions\" -Recurse -Force -ErrorAction SilentlyContinue
}

# Patch settings.json: Mac shellPath/paths -> Windows
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
Write-Host "  1. Create $PiDir\auth.json from auth.example.json and fill in real values"
Write-Host "  2. Replace YOUR_MORPH_API_KEY in $PiDir\mcp.json"
Write-Host "  3. Set env vars systemwide (open a NEW terminal afterwards):"
Write-Host "       setx BASETEN_API_KEY    `"...`""
Write-Host "       setx DEEPSEEK_API_KEY   `"...`""
Write-Host "       setx FIREWORKS_API_KEY  `"...`""
Write-Host "       setx NOVITA_API_KEY     `"...`""
Write-Host "       setx OPENCODE_API_KEY   `"...`""
Write-Host "       setx OPENROUTER_API_KEY `"...`""
Write-Host "       setx HF_TOKEN           `"...`""
Write-Host "  4. npm i -g @mariozechner/pi-coding-agent"
Write-Host "  5. bun install in $PiDir\extensions\exa-remote and $PiDir\extensions\mcp-bridge"
Write-Host "  6. First pi run will clone package extensions; bun install in each ~\.pi\agent\git\github.com\<owner>\<repo>\ afterwards"
Write-Host "  7. /login for github-copilot, openai-codex, google-antigravity, anthropic, cursor-agent as needed"
