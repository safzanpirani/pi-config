#!/bin/bash
set -e

PI_DIR="$HOME/.pi/agent"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Setting up Pi configuration..."
mkdir -p "$PI_DIR/extensions"

cp "$SCRIPT_DIR/settings.json" "$PI_DIR/settings.json"
cp "$SCRIPT_DIR/mcp.json" "$PI_DIR/mcp.json"
cp "$SCRIPT_DIR/models.json" "$PI_DIR/models.json"

if [ -d "$SCRIPT_DIR/extensions" ]; then
  cp -r "$SCRIPT_DIR/extensions/"* "$PI_DIR/extensions/" 2>/dev/null || true
fi

# Rewrite agent paths if your username isn't "safzan".
if [ "$(whoami)" != "safzan" ]; then
  sed -i.bak "s|/Users/safzan/.pi/agent/|$PI_DIR/|g" "$PI_DIR/settings.json"
  rm -f "$PI_DIR/settings.json.bak"
  echo "Patched settings.json: agent path -> $PI_DIR/"
fi

echo ""
echo "Configuration copied to $PI_DIR"
echo ""
echo "Next steps:"
echo "  1. Create $PI_DIR/auth.json from auth.example.json and fill in real values"
echo "  2. Replace YOUR_MORPH_API_KEY in $PI_DIR/mcp.json"
echo "  3. Add the env-var providers to your shell rc (~/.zshrc or ~/.bashrc):"
echo "       export BASETEN_API_KEY=\"...\""
echo "       export DEEPSEEK_API_KEY=\"...\""
echo "       export FIREWORKS_API_KEY=\"...\""
echo "       export NOVITA_API_KEY=\"...\""
echo "       export OPENCODE_API_KEY=\"...\""
echo "       export OPENROUTER_API_KEY=\"...\""
echo "       export HF_TOKEN=\"...\""
echo "  4. Run pi (first run clones package extensions and starts up)"
echo "  5. /login for github-copilot, openai-codex, google-antigravity, anthropic, cursor-agent as needed"
