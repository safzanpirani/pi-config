#!/bin/bash
# Pi Config Setup Script for Linux/macOS

set -e

PI_DIR="$HOME/.pi/agent"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔧 Setting up Pi configuration..."
echo ""

# Create pi directory structure
mkdir -p "$PI_DIR"
mkdir -p "$PI_DIR/extensions"

# Copy settings
echo "📄 Copying settings.json..."
cp "$SCRIPT_DIR/settings.json" "$PI_DIR/settings.json"

echo "📄 Copying mcp.json..."
cp "$SCRIPT_DIR/mcp.json" "$PI_DIR/mcp.json"

# Copy extensions
echo "📦 Copying extensions..."
if [ -d "$SCRIPT_DIR/extensions" ]; then
    cp -r "$SCRIPT_DIR/extensions/"* "$PI_DIR/extensions/" 2>/dev/null || true
fi

echo ""
echo "✅ Configuration files copied!"
echo ""

# Check for required secrets
missing_secrets=0

if [ ! -f "$PI_DIR/auth.json" ]; then
    echo "⚠️  Missing: auth.json"
    echo "   → Run 'pi' and use /login to authenticate with providers"
    missing_secrets=1
fi

if [ ! -f "$PI_DIR/antigravity-accounts.json" ]; then
    echo "ℹ️  Optional: antigravity-accounts.json not found"
    echo "   → For multi-account, use /ag-import after each /login google-antigravity"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $missing_secrets -eq 1 ]; then
    echo "📋 Next steps:"
    echo ""
    echo "   1. Run: pi"
    echo "   2. Login: /login google-antigravity"
    echo "   3. Login: /login github-copilot"
    echo "   4. Login: /login openai-codex"
    echo ""
    echo "   For multi-account Antigravity:"
    echo "   5. /ag-import  (after each google-antigravity login)"
    echo ""
else
    echo "🎉 Setup complete! Run 'pi' to start."
fi
