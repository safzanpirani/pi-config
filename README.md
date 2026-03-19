# Pi Configuration (Public)

Public, sanitized version of my Pi setup.

> This repo is safe to publish. Secrets and personal runtime state are intentionally excluded.

## Includes

- custom local extensions:
  - `extensions/codex-swap`
  - `extensions/codex-fast`
  - `extensions/mcp-bridge`
  - `extensions/exa-remote`
  - `extensions/safzan-proxy`
  - `extensions/tool-result-cleanup.ts`
- `settings.json`
- `models.json`
- example auth + MCP config
- setup scripts for macOS/Linux and Windows

## Not included

- `auth.json`
- real API keys / OAuth tokens
- `codexswap.json`
- session history / caches / backups
- machine-specific state

## Quick setup

### macOS / Linux

```bash
git clone https://github.com/safzanpirani/pi-config.git ~/.pi-config-public
cd ~/.pi-config-public
chmod +x setup.sh
./setup.sh
```

### Windows (PowerShell)

```powershell
git clone https://github.com/safzanpirani/pi-config.git $env:USERPROFILE\.pi-config-public
cd $env:USERPROFILE\.pi-config-public
.\setup.ps1
```

## After setup

1. Copy `auth.example.json` as a reference for `~/.pi/agent/auth.json`
2. Put your Morph key into `~/.pi/agent/mcp.json`
3. Start Pi and log in to providers as needed:
   - `/login github-copilot`
   - `/login openai-codex`
4. Optional: add OpenRouter / AgentRouter API keys to `auth.json`

## Notes

- `codexswap.json` is private runtime state; the `codex-swap` extension will create/use it locally.
- `codex-fast.json` is also local state and is intentionally not tracked here.
- `mcp-bridge` reads `~/.pi/agent/mcp.json` and exposes MCP tools inside Pi.
- `safzan-proxy` registers `agentrouter` / `safzan-proxy` provider entries from `auth.json`.

## Private counterpart

The private repo contains the same general setup plus real secrets and personal runtime state.
