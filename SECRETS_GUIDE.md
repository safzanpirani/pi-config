# Secrets Guide

This file documents which secrets belong where for the current Pi setup.

## Rule of thumb

- **Public repo (`pi-config`)**: placeholders only, never real secrets.
- **Private repo (`pi-config-private`)**: may contain real secrets and runtime state.
- **Best practice**: avoid hardcoding secrets in TypeScript source files even in the private repo when a config file or env var works.

## Current secret-bearing areas

| Area | File | What belongs there | Public repo | Private repo |
|---|---|---|---|---|
| Provider auth | `auth.json` | OAuth refresh/access tokens and API-key style provider creds | Placeholder example only | Real values allowed |
| MCP server env | `mcp.json` | MCP env vars like `MORPH_API_KEY` | Placeholder only | Real values allowed |
| Model provider config | `models.json` | Provider config; use env var names in public | Placeholder names only | Real values allowed, but env names are better |
| Runtime account state | `antigravity-accounts.json`, `codexswap.json`, `codex-fast.json` | Multi-account and local toggle state | Do not commit | Commit only if you want exact machine bootstrap |
| Extension source | `extensions/*.ts` | Prefer no secrets here | Never | Avoid if possible |

## Current auth inventory on the live MacBook (2026-05-06)

These provider entries currently exist in the live `auth.json`:

### OAuth-style entries
- `github-copilot`
- `openai-codex`
- `google-antigravity`
- `anthropic`
- `cursor-agent`

### API-key-style entries
- `openrouter`
- `agentrouter`
- `safzan-proxy`
- `fireworks`
- `oc`
- `opencode-zen`
- `llamacpp`

## Providers NOT in `auth.json` that are still used (env vars)

These show up in `models.json` and are referenced by `enabledModels` in `settings.json`. They get their key from the shell env on Mac and from `setx` user env on Windows:

| Env var | Used by |
|---|---|
| `BASETEN_API_KEY` | `baseten/moonshotai/Kimi-K2.6` |
| `DEEPSEEK_API_KEY` | `deepseek/deepseek-v4-pro` (current default model), `deepseek/deepseek-v4-flash` |
| `FIREWORKS_API_KEY` | `fireworks/*` (also covered by auth.json — env is fallback) |
| `NOVITA_API_KEY` | `novita/moonshotai/kimi-k2.6` |
| `OPENCODE_API_KEY` | `opencode/kimi-k2.6`, `opencode/claude-opus-4-{5,6,7}` |
| `OPENROUTER_API_KEY` | `openrouter/*` (also covered by auth.json — env is fallback) |
| `HF_TOKEN` | optional, only if you wire HF up |

## What to include in `auth.json`

Only include the providers you actually use.

### Commonly needed
- `github-copilot`
- `openai-codex`
- `google-antigravity`
- `openrouter`
- `agentrouter`
- `fireworks`

### Optional / custom
- `anthropic`
- `cursor-agent`
- `safzan-proxy`
- `oc`
- `opencode-zen`
- `llamacpp`

## Special cases from the current live setup

### `mcp.json`
The live setup uses:
- `MORPH_API_KEY`

In public, keep it as a placeholder like:

```json
{
  "servers": {
    "morph-mcp": {
      "env": {
        "MORPH_API_KEY": "YOUR_MORPH_API_KEY"
      }
    }
  }
}
```

### `models.json`
The live setup includes provider entries that rely on API keys or env-variable-style placeholders.

For the public repo, keep env-var placeholder names only. The live `models.json` has these hardcoded keys that **must** be sanitized before publishing:

| Provider | Live `models.json` value | Public placeholder |
|---|---|---|
| `digitalocean` | `sk-do-...` | `DIGITALOCEAN_API_KEY` |
| `baseten` | (raw key) | `BASETEN_API_KEY` |
| `novita` | `sk_...` | `NOVITA_API_KEY` |

### Extension config files
- `extensions/exa-remote.json` contains a real Exa API key. **Excluded from public repo.** Lives in private repo only.
- `extensions/pi-fff.json`, `extensions/providers.json`, `extensions/subagents.json` are safe to publish.

## Recommended split

### Public repo should contain
- `settings.json`
- public-safe `models.json`
- placeholder `mcp.json`
- `auth.example.json`
- safe extension source and docs

### Private repo should contain
- everything above
- `auth.json`
- `mcp.json` with real values
- `antigravity-accounts.json`
- `codexswap.json`
- `codex-fast.json`
- any other secret-bearing machine bootstrap files you intentionally want to restore on a new machine
