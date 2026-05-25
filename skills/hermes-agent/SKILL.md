---
name: hermes-agent
description: Integrate NousResearch Hermes Agent via CLI. Self-improving skills, persistent memory (FTS5 + LLM summaries), sub-agent delegation with parallel processing, MCP bidirectional integration, browser automation, code execution, and web research. Use when the user wants to install, configure, or invoke Hermes Agent, delegate complex tasks, search agent memory, manage skills, or set up cron/plugins/MCP.
license: MIT
---

# Hermes Agent Skill v2.0

## Overview

This skill wraps the [NousResearch Hermes Agent](https://github.com/NousResearch/hermes-agent) CLI so Pi can invoke Hermes core capabilities through shell commands.

**v2.0: fully portable — no hardcoded paths, one-command install on any instance.**

---

## First-Time Installation

### One-Command Install (Recommended)

When Hermes is not detected, run:

```bash
# Install Hermes Agent (auto-clone, create venv, create CLI entrypoint)
bash ~/.pi/agent/skills/hermes-agent/scripts/install_hermes.sh

# Or with a custom install prefix
bash ~/.pi/agent/skills/hermes-agent/scripts/install_hermes.sh --prefix ~/custom/path
```

The install script automatically:
1. ✅ Detects Python 3.11+
2. ✅ Clones Hermes Agent source
3. ✅ Creates a Python virtual environment and installs dependencies
4. ✅ Creates `~/.local/bin/hermes` CLI entrypoint
5. ✅ Initializes `~/.hermes/` config directory
6. ✅ Generates a default `.env` config template

### Configure API Keys After Install

```bash
# Edit config file to add your API key
nano ~/.hermes/.env
```

Choose any provider (pick at least one):
```bash
# Z.AI / GLM (recommended for Chinese users)
GLM_API_KEY=your-key-here

# OpenRouter (supports 200+ models)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here

# OpenAI
OPENAI_API_KEY=sk-your-key-here
```

### Verify Installation

```bash
# Ensure PATH includes hermes
export PATH="$HOME/.local/bin:$PATH"
hermes --version

# Run diagnostics
hermes doctor
```

---

## Migrating to Another Instance

Copy the entire skill directory to the target instance:

```bash
# On the target:
cp -r /path/to/hermes-agent ~/.pi/agent/skills/hermes-agent
bash ~/.pi/agent/skills/hermes-agent/scripts/install_hermes.sh
# Then configure API keys
```

---

## Core Workflows

### 1. Invocation Quick Reference (Hermes v0.12+)

| Scenario | Command | Notes |
|----------|---------|-------|
| **Quick Q&A** | `hermes -z "question"` | Simplest call — single turn, no TUI |
| **With tools/model** | `hermes chat -q "question" -Q -t web,terminal -m gpt-5.5` | Full control |
| **Wrapper (JSON)** | `bash scripts/hermes_wrapper.sh run "question"` | Pi-friendly JSON output |
| **Sub-agent delegation** | `bash scripts/hermes_delegate.sh --task "..."` | Complex task decomposition |
| **Skill query** | `hermes skills list` | View installed skills |
| **Memory status** | `hermes memory status` | Memory provider config |
| **Status check** | `hermes status` or `hermes doctor` | Diagnose installation |

### 2. Full CLI Command Reference

**Important:** Hermes v0.12+ removed `hermes run` — use `hermes -z` for quick prompts or `hermes chat -q` for full control. The wrapper/delegate scripts have been updated for v0.12+.

For complete command documentation, load: `references/cli-commands.md`

#### Basic Commands (Hermes v0.12+)

```bash
# Start interactive session
hermes

# Single-turn execution — quickest path (no TUI, no streaming)
hermes -z "prompt"

# Single-turn with model/tool/skill control (quiet mode)
hermes chat -q "prompt" -Q [options]

# Chat mode options
-q, --query PROMPT   # Single query (non-interactive)
-Q, --quiet          # Suppress banners/spinners for programmatic use
-m, --model MODEL    # Model override (e.g., gpt-5.5)
-t, --toolsets TS    # Comma-separated tool restrictions
-s, --skills SKILLS  # Preload skills
--provider PROVIDER  # Inference provider
--max-turns N        # Max agent turns (default: 90)
--yolo               # Skip approval prompts
```

#### Sub-Agent Delegation

```bash
# Via wrapper script (recommended)
bash scripts/hermes_delegate.sh \
  --task "Analyze competitor products A and B" \
  --tools "web,terminal" \
  --timeout 300 \
  --output ./result.md

# Directly using hermes chat
hermes chat -q "Complete this task: analyze XXX" -Q -t web,terminal --max-turns 50
```

#### Memory Management (v0.12+ — external provider-based)

```bash
# Check current memory provider
hermes memory status

# Configure external memory (honcho, mem0, etc.)
hermes memory setup

# Disable external provider (built-in only)
hermes memory off

# Reset built-in memory (MEMORY.md/USER.md)
hermes memory reset
```

#### Skill Management (v0.12+ — hub-based)

```bash
hermes skills list                           # List installed skills
hermes skills browse                         # Browse all available skills
hermes skills search "keyword"               # Search registries
hermes skills install skill-name             # Install from hub
hermes skills inspect skill-name             # Preview before install
hermes skills check                          # Check for updates
hermes skills uninstall skill-name           # Remove
```

#### Plugin Management

```bash
hermes plugins list                    # List plugins
hermes plugins install user/repo       # Install plugin
hermes plugins enable/disable/update/remove plugin-name
```

#### Cron Jobs

```bash
hermes cron list                       # List scheduled tasks
hermes cron add --name "daily" --cron "0 9 * * *" --message "Generate summary"
hermes cron pause/resume/remove TASK_ID
```

#### MCP Integration

```bash
hermes mcp serve --port 8080           # Start MCP Server
hermes mcp connect <server-config>     # Connect to external MCP service
```

---

## Wrapper Scripts

### scripts/hermes_wrapper.sh

Unified CLI wrapper providing JSON-formatted output and error handling:

```bash
./scripts/hermes_wrapper.sh [command] [args...]

# Examples
./scripts/hermes_wrapper.sh run "Analyze content" --timeout 60
./scripts/hermes_wrapper.sh memory search "keyword"
./scripts/hermes_wrapper.sh status
```

**Output format**: JSON (fields: `success`, `output`, `error`, `duration_ms`)

### scripts/hermes_delegate.sh

Dedicated sub-agent delegation script:

```bash
./scripts/hermes_delegate.sh --task "task description" [options]

# Options
--tools "tool1,tool2"      # Restrict available toolsets
--timeout 300              # Timeout in seconds
--output ./result.md        # Output file path
--max-concurrent 3         # Max concurrent delegates (default 3)
--context-file ./ctx.md     # Additional context file
-v                         # Verbose output
```

### scripts/install_hermes.sh

One-command installer (see First-Time Installation above):

```bash
bash scripts/install_hermes.sh [--skip-deps] [--prefix DIR]
```

---

## Model Configuration

Run the interactive config wizard:

```bash
hermes model
```

Or directly edit `~/.hermes/config.yaml`:

```yaml
model:
  provider: openrouter       # Options: openrouter, anthropic, openai, zai, gemini, etc.
  default: "anthropic/claude-sonnet-4-20250514"
  base_url: "https://openrouter.ai/api/v1"
```

**Supported providers**: openrouter, anthropic, openai, gemini, zai, kimi-coding, nous, custom

---

## Best Practices

### ✅ Recommended

1. **Use `hermes -z` for quick prompts, `hermes chat -q -Q` for tool control** — avoids TUI blocking
2. **Set reasonable timeouts** — simple tasks 60s, complex 300s
3. **Restrict toolsets** — use `-t` to reduce token consumption
4. **Use the wrapper scripts** — they provide JSON output for Pi integration
5. **Retry on error** — auto-retry 1–2 times on network issues

### ⚠️ Caveats

1. **Token cost** — every `hermes run` call incurs LLM token spend
2. **Concurrency limit** — max 3 concurrent sub-agents
3. **Timeout protection** — always set timeout for long-running tasks
4. **API key security** — never hardcode keys in skill files
5. **Python version** — requires Python 3.11+

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `command not found: hermes` | Run `export PATH="$HOME/.local/bin:$PATH"` or re-run `install_hermes.sh` |
| `TypeError: unsupported operand` | Ensure Python 3.11+ |
| API Key error | Check `~/.hermes/.env` config |
| Connection timeout | Check network, or switch LLM provider |
| Sub-agent failure | Reduce `--max-concurrent` or increase `--timeout` |
| Install script failed | Run `hermes doctor` to diagnose |

---

## File Structure

```
hermes-agent/
├── SKILL.md                    # This file (skill documentation)
├── scripts/
│   ├── install_hermes.sh       # One-command installer (universal)
│   ├── hermes_wrapper.sh       # Unified CLI wrapper (dynamic path detection)
│   └── hermes_delegate.sh      # Sub-agent delegation script (dynamic path detection)
└── references/                 # Reference documentation
    ├── cli-commands.md         # Full CLI command reference
    ├── config-guide.md         # Configuration guide
    ├── mcp-integration.md      # MCP integration details
    ├── plugin-development.md   # Plugin development guide
    └── self-improving-integration.md  # Self-improving integration
```

---

## Changelog

- **v2.1.0** (2026-05-03): Updated wrapper/delegate scripts for Hermes v0.12+ CLI (`hermes -z` / `hermes chat -q` instead of `hermes run`). Updated docs.
- **v2.0.0** (2026-04-12): Fully portable — removed all hardcoded paths, added one-command installer, supports migration to any agent instance
- **v1.0.0** (2026-04-11): Initial release, supports basic CLI calls, sub-agent delegation, memory/skill management
