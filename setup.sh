#!/bin/bash
set -e

PI_DIR="$HOME/.pi/agent"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔧 Setting up Pi configuration..."
mkdir -p "$PI_DIR/extensions"

cp "$SCRIPT_DIR/settings.json" "$PI_DIR/settings.json"
cp "$SCRIPT_DIR/mcp.json" "$PI_DIR/mcp.json"
cp "$SCRIPT_DIR/models.json" "$PI_DIR/models.json"

if [ -d "$SCRIPT_DIR/extensions" ]; then
  cp -r "$SCRIPT_DIR/extensions/"* "$PI_DIR/extensions/" 2>/dev/null || true
fi

echo ""
echo "✅ Configuration copied to $PI_DIR"
echo ""
echo "Next steps:"
echo "  1. Create or update $PI_DIR/auth.json (see auth.example.json)"
echo "  2. Add your Morph API key to $PI_DIR/mcp.json"
echo "  3. Run pi"
echo "  4. Use /login for github-copilot and/or openai-codex"
