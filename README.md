# Pi Configuration (Public)

Public, sanitized mirror of my current Pi setup.

> Safe to publish. Real tokens, API keys, OAuth refresh tokens, session data, caches, and machine-local runtime state are intentionally excluded.

## Snapshot

Mirrored from the live `~/.pi/agent` on the MacBook on **2026-05-06**.

For the exact public/private split and key inventory, see:
- [`SECRETS_GUIDE.md`](./SECRETS_GUIDE.md)
- [`LIVE_STATE_REPORT.md`](./LIVE_STATE_REPORT.md)

## Included

- `settings.json` from the live machine (Mac paths intact; setup script rewrites for Windows)
- `models.json` with hardcoded keys swapped for env-var name placeholders (`BASETEN_API_KEY`, `DEEPSEEK_API_KEY`, `NOVITA_API_KEY`, `DIGITALOCEAN_API_KEY`, etc.)
- `mcp.json` with placeholder `YOUR_MORPH_API_KEY`
- `auth.example.json` showing the current `auth.json` shape (12 providers) for you to fill locally
- Local extensions safe to share:
  - `extensions/codex-fast/index.ts`
  - `extensions/codex-swap/index.ts`
  - `extensions/mcp-bridge/index.ts`
  - `extensions/exa-remote/index.ts`
  - `extensions/safzan-proxy/index.ts` + `README.md`
  - `extensions/pro-mode/` (full dir)
  - `extensions/codex-usage-indicator.{ts,md}`
  - `extensions/copilot-backend-warning.ts`
  - `extensions/tool-result-cleanup.ts`
  - `extensions/fireworks-provider-remap.ts`
  - `extensions/pi-prefill.ts`
  - `extensions/providers.json`, `subagents.json`, `pi-fff.json`
- `setup.sh` (Mac/Linux) and `setup.ps1` (Windows) — copy + path-rewrite

## Not included

- `auth.json`, `codexswap.json`, `codex-fast.json`, `antigravity-accounts.json`, `extensions/exa-remote.json` (all contain credentials)
- `mcp.json` real `MORPH_API_KEY` value
- real provider keys in `models.json`
- `sessions/`, `cache/`, `subagents/`, `pi-fff/`, `git/`, `node_modules/`, crash logs, `*.bak`

---

## Setup on macOS or Linux

```bash
git clone https://github.com/safzanpirani/pi-config.git ~/.pi-config-public
cd ~/.pi-config-public
chmod +x setup.sh
./setup.sh
```

`setup.sh` copies `settings.json`, `mcp.json`, `models.json`, and `extensions/` into `~/.pi/agent/`.

After that:

1. Copy `auth.example.json` → `~/.pi/agent/auth.json` and fill the providers you use.
2. Edit `~/.pi/agent/mcp.json` and replace `YOUR_MORPH_API_KEY`.
3. In `~/.pi/agent/models.json`, replace the env-var-name placeholders if you'd rather hardcode them (or just export those env vars).
4. Set the env-var-only providers in your shell rc:

   ```bash
   export BASETEN_API_KEY="..."
   export DEEPSEEK_API_KEY="..."
   export FIREWORKS_API_KEY="..."
   export NOVITA_API_KEY="..."
   export OPENCODE_API_KEY="..."
   export OPENROUTER_API_KEY="..."
   export HF_TOKEN="..."
   ```

5. Start pi and `/login` for OAuth providers as needed:
   - `/login github-copilot`
   - `/login openai-codex`
   - `/login google-antigravity`
   - `/login anthropic`
   - `/login cursor-agent`

---

## Setup on Windows (PowerShell)

```powershell
git clone https://github.com/safzanpirani/pi-config.git $env:USERPROFILE\.pi-config-public
cd $env:USERPROFILE\.pi-config-public
.\setup.ps1
```

`setup.ps1` copies the same files into `$env:USERPROFILE\.pi\agent\` **and rewrites** `settings.json` for Windows: `shellPath` → `powershell.exe`, and `/Users/safzan/.pi/agent/` → `$env:USERPROFILE\.pi\agent\`.

After that:

1. Copy `auth.example.json` → `$env:USERPROFILE\.pi\agent\auth.json` and fill the providers you use.
2. Edit `$env:USERPROFILE\.pi\agent\mcp.json` and replace `YOUR_MORPH_API_KEY`.
3. Set the env-var providers systemwide:

   ```powershell
   setx BASETEN_API_KEY    "..."
   setx DEEPSEEK_API_KEY   "..."
   setx FIREWORKS_API_KEY  "..."
   setx NOVITA_API_KEY     "..."
   setx OPENCODE_API_KEY   "..."
   setx OPENROUTER_API_KEY "..."
   setx HF_TOKEN           "..."
   # Open a NEW terminal afterwards.
   ```

4. Install pi globally and per-extension bun deps:

   ```powershell
   npm i -g @mariozechner/pi-coding-agent

   foreach ($d in @("exa-remote","mcp-bridge")) {
     Push-Location "$env:USERPROFILE\.pi\agent\extensions\$d"
     bun install
     Pop-Location
   }
   ```

5. First `pi` invocation will clone all package extensions into `~\.pi\agent\git\...`. Then install bun deps in each:

   ```powershell
   $repos = @(
     "aliou\pi-extensions",
     "tmustier\pi-extensions",
     "prateekmedia\pi-hooks",
     "prateekmedia\claude-agent-sdk-pi",
     "kcosr\pi-extensions\apply-patch-tool",
     "pasky\chrome-cdp-skill"
   )
   foreach ($r in $repos) {
     $p = "$env:USERPROFILE\.pi\agent\git\github.com\$r"
     if (Test-Path "$p\package.json") { Push-Location $p; bun install; Pop-Location }
   }
   ```

6. Run pi and `/login` for OAuth providers as needed.

---

## Notes

- Live default provider is **`opencode-go`**, default model **`deepseek-v4-pro`**. Without `DEEPSEEK_API_KEY` set, default chat will fail until you change provider/model or set the env var.
- Don't hardcode API keys in extension source files in this repo.
- Anthropic OAuth tokens can be device-bound — re-login on a new machine if needed.
- The private counterpart (`pi-config-private`) contains the same files plus real secrets for fast bootstrap.
