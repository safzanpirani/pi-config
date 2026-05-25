# Pi Configuration (Public)

Public, sanitized mirror of my current Pi setup.

> Safe to publish. Real tokens, API keys, OAuth refresh tokens, session data, caches, and machine-local runtime state are intentionally excluded.

## Snapshot

Mirrored from the live `~/.pi/agent` on the MacBook on **2026-05-25**.

For the public/private split and key inventory, see:
- [`SECRETS_GUIDE.md`](./SECRETS_GUIDE.md)
- [`LIVE_STATE_REPORT.md`](./LIVE_STATE_REPORT.md)

## Included

- `settings.json` from the live machine (Mac paths are rewritten by setup scripts)
- `models.json` with real provider keys replaced by env-var names/placeholders
- `mcp.json` with placeholder MCP env values
- `auth.example.json` showing the current auth shape with placeholder values
- `extensions/` custom extension source and package manifests, excluding secret config files
- `prompts/` custom prompt templates
- `skills/` self-contained public-safe snapshot of local Agent Skills
- `setup.sh` and `setup.ps1` to copy the public config into `~/.pi/agent`

## Not included

- `auth.json`
- `.env.pi`, `.env.pi.json`
- `antigravity-accounts.json`, `codexswap.json`, `codex-fast.json`
- `extensions/exa-remote.json`
- real MCP env values and real provider keys
- `sessions/`, `cache/`, `subagents/`, `pi-fff/`, `git/`, `npm/`, `node_modules/`
- backup files, crash logs, machine-local helper binaries

---

## Setup on macOS or Linux

```bash
git clone https://github.com/safzanpirani/pi-config.git ~/.pi-config-public
cd ~/.pi-config-public
chmod +x setup.sh
./setup.sh
```

The setup script copies `settings.json`, `mcp.json`, `models.json`, `auth.example.json`, `extensions/`, `prompts/`, and `skills/` into `~/.pi/agent/`, then rewrites `/Users/safzan/.pi/agent/` paths to your target Pi config directory.

After that:

1. Copy `~/.pi/agent/auth.example.json` to `~/.pi/agent/auth.json` and fill the providers you use.
2. Replace placeholder values in `~/.pi/agent/mcp.json`.
3. Export the env vars referenced by `~/.pi/agent/models.json`.
4. Install Pi if needed:

   ```bash
   npm i -g @earendil-works/pi-coding-agent
   ```

5. Start `pi`. First startup will clone package extensions from `settings.json`.
6. Use `/login` for OAuth providers as needed.

---

## Setup on Windows (PowerShell)

```powershell
git clone https://github.com/safzanpirani/pi-config.git $env:USERPROFILE\.pi-config-public
cd $env:USERPROFILE\.pi-config-public
.\setup.ps1
```

The PowerShell setup script copies the same resources into `$env:USERPROFILE\.pi\agent\` and rewrites `settings.json` for Windows (`shellPath` and Pi config paths).

Then fill `auth.json`, replace MCP placeholders, set model-provider env vars with `setx`, open a new terminal, and run `pi`.

---

## Notes

- Live default provider is `openai-codex`, default model is `gpt-5.5`, thinking level is `xhigh`.
- Do not hardcode API keys in this repo.
- The private counterpart (`pi-config-private`) contains the same resources plus real secrets and `.env.pi`/`.env.pi.json` for fast bootstrap.
