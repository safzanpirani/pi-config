# Pi Config Setup Script for Windows PowerShell

$ErrorActionPreference = "Stop"

$PiDir = "$env:USERPROFILE\.pi\agent"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "🔧 Setting up Pi configuration..." -ForegroundColor Cyan
Write-Host ""

# Create pi directory structure
New-Item -ItemType Directory -Force -Path $PiDir | Out-Null
New-Item -ItemType Directory -Force -Path "$PiDir\extensions" | Out-Null

# Copy settings
Write-Host "📄 Copying settings.json..."
Copy-Item "$ScriptDir\settings.json" "$PiDir\settings.json" -Force

Write-Host "📄 Copying mcp.json..."
Copy-Item "$ScriptDir\mcp.json" "$PiDir\mcp.json" -Force

# Copy extensions
Write-Host "📦 Copying extensions..."
if (Test-Path "$ScriptDir\extensions") {
    Copy-Item "$ScriptDir\extensions\*" "$PiDir\extensions\" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "✅ Configuration files copied!" -ForegroundColor Green
Write-Host ""

# Check for required secrets
$missingSecrets = $false

if (-not (Test-Path "$PiDir\auth.json")) {
    Write-Host "⚠️  Missing: auth.json" -ForegroundColor Yellow
    Write-Host "   → Run 'pi' and use /login to authenticate with providers"
    $missingSecrets = $true
}

if (-not (Test-Path "$PiDir\antigravity-accounts.json")) {
    Write-Host "ℹ️  Optional: antigravity-accounts.json not found" -ForegroundColor Blue
    Write-Host "   → For multi-account, use /ag-import after each /login google-antigravity"
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

if ($missingSecrets) {
    Write-Host "📋 Next steps:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   1. Run: pi"
    Write-Host "   2. Login: /login google-antigravity"
    Write-Host "   3. Login: /login github-copilot"
    Write-Host "   4. Login: /login openai-codex"
    Write-Host ""
    Write-Host "   For multi-account Antigravity:"
    Write-Host "   5. /ag-import  (after each google-antigravity login)"
    Write-Host ""
} else {
    Write-Host "🎉 Setup complete! Run 'pi' to start." -ForegroundColor Green
}
