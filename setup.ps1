$ErrorActionPreference = "Stop"

$PiDir = "$env:USERPROFILE\.pi\agent"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "🔧 Setting up Pi configuration..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$PiDir\extensions" | Out-Null

Copy-Item "$ScriptDir\settings.json" "$PiDir\settings.json" -Force
Copy-Item "$ScriptDir\mcp.json" "$PiDir\mcp.json" -Force
Copy-Item "$ScriptDir\models.json" "$PiDir\models.json" -Force

if (Test-Path "$ScriptDir\extensions") {
  Copy-Item "$ScriptDir\extensions\*" "$PiDir\extensions\" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "✅ Configuration copied to $PiDir" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Create or update $PiDir\auth.json (see auth.example.json)"
Write-Host "  2. Add your Morph API key to $PiDir\mcp.json"
Write-Host "  3. Run pi"
Write-Host "  4. Use /login for github-copilot and/or openai-codex"
