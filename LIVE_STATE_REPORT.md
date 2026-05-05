# Live State Report

Snapshot source: `~/.pi/agent` on the current MacBook
Snapshot date: **2026-05-06**

## High-level state

- default provider: `opencode-go`
- default model: `deepseek-v4-pro`
- thinking level: `high`
- compaction: `enabled`
- transport: `websocket-cached`
- steering / follow-up mode: `all`
- pi version: `0.72.1`

## Live config inventory

### Packages enabled

- `git:github.com/aliou/pi-extensions`
- `git:github.com/tmustier/pi-extensions`
- `git:github.com/prateekmedia/pi-hooks`
- `npm:pi-web-access`
- `npm:shitty-extensions`
- `git:github.com/pasky/chrome-cdp-skill@v1.0.1`
- `npm:pi-cursor-agent`
- `npm:pi-subagents`
- `git:github.com/prateekmedia/claude-agent-sdk-pi`
- `npm:pi-autoresearch`
- `npm:@aliou/pi-processes`
- `npm:pi-markdown-preview`
- `git:github.com/injaneity/pi-computer-use@v0.2.1`
- `-git:github.com/ShpetimA/pi-fff` (disabled)

### Live auth providers present

- `agentrouter`
- `anthropic`
- `cursor-agent`
- `fireworks`
- `github-copilot`
- `google-antigravity`
- `llamacpp`
- `oc`
- `openai-codex`
- `opencode-zen`
- `openrouter`
- `safzan-proxy`

### Runtime state counts

- Antigravity accounts: `8`
- Codex profiles: `15`
- Codex fast mode: `off`

## Safe files mirrored here from the live machine

- `settings.json` (Mac paths preserved; setup.ps1 rewrites for Windows)
- `models.json` with hardcoded keys swapped for env-var name placeholders
- `mcp.json` with placeholder `YOUR_MORPH_API_KEY`
- `auth.example.json` regenerated to match the current 12-provider shape
- All custom extensions in `extensions/` (see README for the full list)

## Intentionally not mirrored publicly

- `auth.json`
- `mcp.json` real `MORPH_API_KEY` value
- `extensions/exa-remote.json` (real Exa key)
- runtime state: `antigravity-accounts.json`, `codexswap.json`, `codex-fast.json`
- `models.json` real `apiKey` values for `digitalocean`, `baseten`, `novita`
- `sessions/`, `subagents/`, `cache/`, `pi-fff/`, `git/`, `node_modules/`
- backup files, crash logs

## Public repo goal

A clean, publishable mirror: explains the setup, exposes safe extension code, only placeholders for anything secret.
