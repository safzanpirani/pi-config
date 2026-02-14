# Pi Configuration (Public)

A curated pi coding agent configuration with multi-account Antigravity support.

> 🔓 **This is a PUBLIC repository. Credentials must be added separately.**

## Features

- **Multi-Account Antigravity**: Round-robin load balancing across multiple Google accounts
- **Curated Extensions**: Best extensions from the pi community
- **Pre-configured Models**: Antigravity, GitHub Copilot, OpenAI Codex
- **MCP Servers**: Morph API, Context7

## Quick Setup

### 1. Clone the repo

```bash
# macOS/Linux
git clone https://github.com/YOUR_USERNAME/pi-config.git ~/.pi-config-public
cd ~/.pi-config-public

# Windows (PowerShell)
git clone https://github.com/YOUR_USERNAME/pi-config.git "$env:USERPROFILE\.pi-config-public"
cd "$env:USERPROFILE\.pi-config-public"
```

### 2. Run setup script

```bash
# macOS/Linux
chmod +x setup.sh
./setup.sh

# Windows (PowerShell)
.\setup.ps1
```

### 3. Add your credentials

You need to create these files in `~/.pi/agent/`:

#### Option A: Login via pi (recommended)
```bash
# Start pi
pi

# Login to providers
/login google-antigravity
/login github-copilot
/login openai-codex
```

#### Option B: Copy from existing device
```bash
# Copy these files from your other device:
# - auth.json
# - antigravity-accounts.json (if using multi-account)
```

---

## For AI Agents: Complete Setup Guide

This section provides detailed instructions for AI coding agents to set up this pi configuration from scratch.

### Prerequisites

1. **pi installed**: 
   ```bash
   npm install -g @mariozechner/pi-coding-agent
   ```

2. **Git configured**: SSH key or HTTPS credentials for GitHub

3. **Node.js**: v18+ recommended

### Directory Structure After Setup

```
~/.pi/agent/
├── auth.json                      # OAuth tokens (YOU MUST CREATE)
├── antigravity-accounts.json      # Multi-account tokens (OPTIONAL)
├── settings.json                  # Pi settings, packages, enabled models
├── mcp.json                       # MCP server configurations
├── extensions/
│   ├── antigravity-multi-account/ # Round-robin multi-account extension
│   │   ├── index.ts
│   │   └── README.md
│   └── codex-swap/                # Multi-account OpenAI Codex switcher
│       └── index.ts
├── sessions/                      # Session files (auto-created)
├── bin/                           # Binary tools (auto-created)
└── git/                           # Cached git packages (auto-created)
```

### Step-by-Step Setup

#### Step 1: Install pi
```bash
npm install -g @mariozechner/pi-coding-agent
```

#### Step 2: Clone and run setup
```bash
git clone https://github.com/YOUR_USERNAME/pi-config.git ~/.pi-config-public
cd ~/.pi-config-public
./setup.sh  # or .\setup.ps1 on Windows
```

#### Step 3: Start pi and login to providers
```bash
pi
```

Inside pi:
```
/login google-antigravity
# Complete OAuth in browser

/login github-copilot  
# Complete OAuth in browser

/login openai-codex
# Complete OAuth in browser
```

#### Step 4: (Optional) Set up multi-account Antigravity

To use multiple Google accounts for load balancing:

```
# After first login, import to multi-account pool
/ag-import

# Login to another Google account
/login google-antigravity
/ag-import

# Repeat for more accounts...

# Check accounts
/ag-accounts

# Set mode
/ag-mode m    # manual (best cache locality)
# or: /ag-mode rr  # round-robin
```

### Configuration Files Reference

#### `settings.json`

```json
{
  "defaultProvider": "google-antigravity",
  "defaultModel": "claude-opus-4-5-thinking",
  "defaultThinkingLevel": "high",
  "packages": [
    "git:github.com/aliou/pi-extensions",
    "git:github.com/tmustier/pi-extensions",
    "git:github.com/prateekmedia/pi-hooks",
    "npm:pi-web-access",
    "npm:shitty-extensions",
    "git:github.com/kcosr/pi-extensions"
  ],
  "enabledModels": [
    "google-antigravity/claude-opus-4-5-thinking",
    "google-antigravity/gemini-3-flash",
    "github-copilot/claude-sonnet-4.5",
    "openai-codex/gpt-5.2"
  ]
}
```

#### `mcp.json`

```json
{
  "servers": {
    "morph-mcp": {
      "command": "npx",
      "args": ["-y", "@morphllm/morphmcp"],
      "env": {
        "MORPH_API_KEY": "your-key-here"
      }
    },
    "context7": {
      "command": "bunx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

#### `auth.json` (YOU CREATE THIS)

```json
{
  "google-antigravity": {
    "type": "oauth",
    "refresh": "1//0g...",
    "access": "ya29...",
    "expires": 1234567890000,
    "projectId": "your-project-id"
  },
  "github-copilot": {
    "type": "oauth",
    "refresh": "ghu_...",
    "access": "...",
    "expires": 1234567890000
  }
}
```

#### `antigravity-accounts.json` (OPTIONAL - for multi-account)

```json
{
  "version": 1,
  "accounts": [
    {
      "email": "account1@gmail.com",
      "refreshToken": "1//0g...",
      "projectId": "project-id-1",
      "addedAt": 1234567890
    },
    {
      "email": "account2@gmail.com",
      "refreshToken": "1//0g...",
      "projectId": "project-id-2",
      "addedAt": 1234567890
    }
  ],
  "activeIndex": 0,
  "rotationMode": "round-robin"
}
```

#### `codexswap.json` (OPTIONAL - multi-account Codex)

This file is created automatically the first time you run `/codexswap`.
It stores multiple saved OpenAI Codex OAuth profiles so you can switch instantly.

### Extension: antigravity-multi-account

Provides multi-account support for the `google-antigravity` provider.

**Features:**
- Three modes: round-robin, use-until-exhausted, manual
- Auto-switches on rate limit (429) in non-manual modes
- Manual pinning via `/ag-use` for cache-friendly workflows
- Tracks rate limit reset times per account
- Request counting per account

**Commands:**

| Command | Description |
|---------|-------------|
| `/ag-accounts` | List all accounts with status |
| `/ag-mode rr` | Round-robin mode (rotate each request) |
| `/ag-mode ue` | Use-until-exhausted mode (switch only on rate limit) |
| `/ag-mode m` | Manual mode (never auto-switch) |
| `/ag-use <email\|index>` | Switch to a specific account manually |
| `/ag-next` | Force switch to next account |
| `/ag-status` | Show current account and stats |
| `/ag-import` | Import new account after `/login google-antigravity` |
| `/ag-remove <email>` | Remove an account |
| `/ag-clear` | Clear rate limit timers |

**How it works:**
1. Overrides `google-antigravity` OAuth provider with multi-account logic
2. In round-robin mode, rotates to next available account each turn
3. In use-until-exhausted mode, stays on one account until rate-limited
4. In manual mode, never auto-switches; you switch via `/ag-use` or `/ag-next`
5. Refreshes access tokens automatically when expired
6. Detects rate limit errors in `turn_end` and tracks reset timers
7. Updates status bar to show current account: `AG: username (#request)`

### Extension: codex-swap

Provides fast switching between multiple OpenAI Codex OAuth logins (work/personal/etc.).

**Commands:**

| Command | Description |
|---------|-------------|
| `/codexswap` | Cycle to the next saved Codex account |
| `/codexswap status` | Show saved profiles and active profile |
| `/codexswap who` or `/codexwho` | Show currently active account |
| `/codexswap add <label>` | Save current `/login openai-codex` account under a label |
| `/codexswap use <label or index>` | Switch to a saved account |
| `/codexswap rm <label or index>` | Remove a saved account |

**Add a third account (or more):**
1. `/login openai-codex` (sign in to the new account)
2. `/codexswap add work-2`
3. Repeat for as many accounts as you want

### Installed Packages

| Package | Extensions |
|---------|------------|
| `git:github.com/aliou/pi-extensions` | defaults, guardrails, meta, planning, presenter, providers, session-management |
| `git:github.com/tmustier/pi-extensions` | agent-guidance, code-actions, raw-paste, tab-status, usage-extension |
| `git:github.com/prateekmedia/pi-hooks` | checkpoint, lsp, lsp-tool, permission, repeat |
| `npm:pi-web-access` | Web browsing capability |
| `npm:shitty-extensions` | cost-tracker, handoff, memory-mode, plan-mode, usage-bar |
| `git:github.com/kcosr/pi-extensions` | apply-patch-tool, assistant, codemap, skill-picker, toolwatch |

### Enabled Models

| Provider | Models |
|----------|--------|
| google-antigravity | claude-opus-4-5-thinking, claude-sonnet-4-5, claude-sonnet-4-5-thinking, gemini-3-flash, gemini-3-pro-high, gemini-3-pro-low |
| github-copilot | claude-opus-4.5, claude-sonnet-4.5, gpt-5.2, gpt-5.2-codex |
| openai-codex | gpt-5.2, gpt-5.2-codex |
| openrouter | moonshotai/kimi-k2.5 |

### Troubleshooting

#### "No API key" or "Use /login to authenticate"
- Run `/login <provider>` to authenticate
- Check `~/.pi/agent/auth.json` exists

#### Extension not loading
- Run `/reload` to reload extensions
- Check for TypeScript syntax errors

#### Multi-account not working
- Ensure `antigravity-accounts.json` exists
- Run `/ag-accounts` to verify accounts are loaded
- Run `/ag-status` to check current state

#### Rate limits
- Run `/ag-status` to see which accounts are rate-limited
- Run `/ag-clear` to reset rate limit timers
- Add more accounts for better distribution

### Updating

```bash
cd ~/.pi-config-public
git pull
./setup.sh  # Re-run to copy updated files
```

## Contributing

Feel free to fork and customize! The multi-account extension can be adapted for other OAuth providers.

## License

MIT
