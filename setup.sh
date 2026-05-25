#!/usr/bin/env bash
set -euo pipefail

PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

copy_dir() {
  local src="$1"
  local dst="$2"
  mkdir -p "$dst"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$src/" "$dst/"
  else
    rm -rf "$dst"
    mkdir -p "$(dirname "$dst")"
    cp -R "$src" "$dst"
  fi
}

rewrite_settings_paths() {
  local settings_path="$1"
  python3 - "$settings_path" "$PI_DIR" <<'PY'
import json, sys
from pathlib import Path

settings_path = Path(sys.argv[1])
pi_dir = sys.argv[2].rstrip('/') + '/'

def rewrite(value):
    if isinstance(value, str):
        return value.replace('/Users/safzan/.pi/agent/', pi_dir)
    if isinstance(value, list):
        return [rewrite(v) for v in value]
    if isinstance(value, dict):
        return {k: rewrite(v) for k, v in value.items()}
    return value

data = json.loads(settings_path.read_text())
settings_path.write_text(json.dumps(rewrite(data), indent=2) + '\n')
PY
}

echo "Setting up sanitized Pi configuration..."
mkdir -p "$PI_DIR"

cp "$SCRIPT_DIR/settings.json" "$PI_DIR/settings.json"
cp "$SCRIPT_DIR/mcp.json" "$PI_DIR/mcp.json"
cp "$SCRIPT_DIR/models.json" "$PI_DIR/models.json"
cp "$SCRIPT_DIR/auth.example.json" "$PI_DIR/auth.example.json"

[ -d "$SCRIPT_DIR/extensions" ] && copy_dir "$SCRIPT_DIR/extensions" "$PI_DIR/extensions"
[ -d "$SCRIPT_DIR/prompts" ] && copy_dir "$SCRIPT_DIR/prompts" "$PI_DIR/prompts"
[ -d "$SCRIPT_DIR/skills" ] && copy_dir "$SCRIPT_DIR/skills" "$PI_DIR/skills"

rewrite_settings_paths "$PI_DIR/settings.json"

echo ""
echo "Configuration copied to $PI_DIR"
echo ""
echo "Next steps:"
echo "  1. Copy $PI_DIR/auth.example.json to $PI_DIR/auth.json and fill in real values"
echo "  2. Replace YOUR_MORPH_API_KEY in $PI_DIR/mcp.json"
echo "  3. Export the API-key providers referenced by $PI_DIR/models.json (for example DEEPSEEK_API_KEY, OPENCODE_API_KEY, OPENROUTER_API_KEY)"
echo "  4. Install pi if needed: npm i -g @earendil-works/pi-coding-agent"
echo "  5. Run pi; first startup will clone package extensions listed in settings.json"
echo "  6. /login for OAuth providers as needed"
