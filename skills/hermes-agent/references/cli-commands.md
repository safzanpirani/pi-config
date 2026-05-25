# Hermes Agent CLI Complete Command Reference

> **Version**: v0.8.0 | **Last Updated**: 2026-04-11

## Table of Contents

1. [Basic Commands](#basic-commands)
2. [Execution Modes](#execution-modes)
3. [Tool Management](#tool-management)
4. [Memory System](#memory-system)
5. [Skill Management](#skill-management)
6. [Plugin System](#plugin-system)
7. [Messaging Gateway](#messaging-gateway)
8. [Cron Jobs](#cron-jobs)
9. [MCP Integration](#mcp-integration)
10. [Diagnostics & Debugging](#diagnostics--debugging)

---

## Basic Commands

### Start Interactive Session

```bash
hermes
```

Starts a TUI (terminal user interface) interactive session.

**Keybindings**:
- `Ctrl+C` — Interrupt current generation
- `Ctrl+D` — Exit
- `Tab` — Autocomplete
- `↑/↓` — History navigation

### Check Version

```bash
hermes --version
hermes -v

# Example output:
# Hermes Agent v0.8.0 (2026.4.8)
# Project: /path/to/hermes-agent
# Python: 3.11.15
# OpenAI SDK: 2.31.0
```

### Show Help

```bash
hermes --help
hermes help <command>
```

---

## Execution Modes

### Single-Turn Execution (run)

```bash
hermes run "your prompt" [options]
```

**Core Options**:

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--non-interactive` | — | false | Disable TUI, suitable for scripting |
| `--no-stream` | — | false | Disable streaming, return full result |
| `--context-file` | `-c` | null | Inject context file path |
| `--toolset` | `-t` | null | Restrict toolset name |
| `--model` | `-m` | config default | Specify model |
| `--provider` | — | config default | Specify LLM provider |
| `--timeout` | — | 300 | Timeout in seconds |
| `--max-tokens` | — | config default | Max output tokens |
| `--temperature` | — | config default | Temperature (0.0–2.0) |

**Examples**:

```bash
# Simplest single-turn call
hermes run "What is machine learning?" --non-interactive --no-stream

# With context file
hermes run "Analyze this project's architecture" \
  --context-file ./AGENTS.md \
  --non-interactive --no-stream

# Restrict toolset
hermes run "Search the latest React docs" \
  --toolset web_search \
  --non-interactive --no-stream

# Specify model and timeout
hermes run "Write a sorting algorithm" \
  --model gpt-4o \
  --temperature 0.2 \
  --timeout 60 \
  --non-interactive --no-stream
```

---

## Tool Management

### List Available Tools

```bash
hermes tools list
hermes tools list --all    # Include disabled tools
```

### Enable / Disable Toolsets

```bash
# List available toolsets
hermes toolsets

# Enable specific toolsets
hermes tools enable web_search browser file_operations

# Disable specific toolsets
hermes tools disable code_execution terminal
```

### Built-in Tools

| Toolset | Included Tools | Purpose |
|---------|----------------|---------|
| `web_search` | search_web, firecrawl_scrape, brave_search, searxng_search | Web search and scraping |
| `browser` | browser_navigate, browser_click, browser_type, browser_screenshot, browser_extract | Browser automation |
| `file_operations` | read_file, write_file, edit_file, glob_files, list_directory | File read/write operations |
| `terminal` | execute_command, bash, shell | Terminal command execution |
| `memory` | memory_search, memory_add_note, memory_list_notes | Memory system access |
| `code_execution` | execute_code | Code execution sandbox |
| `delegation` | delegate_task | Sub-agent delegation |
| `skills` | skills_list, skills_create, skills_edit, skills_remove | Skill management |
| `image_generation` | generate_image, upscale_image | AI image generation |
| `voice` | text_to_speech, transcribe_audio | TTS and speech recognition |

---

## Memory System

### Search Memory

```bash
hermes memory search "keyword"
hermes memory search "user preferences" --limit 10
```

### Notes Management

```bash
# List all notes
hermes memory notes list

# Add a new note
hermes memory notes add "Important discovery: XXX"

# Search note content
hermes memory notes search "query"
```

### Import / Export

```bash
# Export all memory data
hermes memory export ./backup/

# Import from backup
hermes memory import ./backup/
```

### Switch Memory Backend

```bash
# View current memory backend
hermes memory status

# Switch to Honcho backend
hermes memory setup honcho

# Use built-in backend
hermes memory setup built-in
```

**Supported Memory Backends**:

| Backend | Features |
|---------|----------|
| `built-in` | Default, SQLite + FTS5 full-text search |
| `honcho` | AI-native memory, dialect modeling |
| `mem0` | Open-source memory service |
| `openviking` | Advanced vector retrieval |
| `hindsight` | Timeline memory |
| `holographic` | Holographic memory system |
| `retaindb` | Enterprise-grade memory storage |
| `byte-rover` | Lightweight local memory |

---

## Skill Management

### List Skills

```bash
hermes skills list
hermes skills ls           # Short form

# View skill details
hermes skills show skill-name
```

### Create Skills

```bash
# Interactive creation
hermes skills create my-skill

# Create with description
hermes skills create research-methodology \
  --description "Systematic web research methodology"

# Create from template
hermes skills create code-review --template default
```

### Edit Skills

```bash
hermes skills edit my-skill
# Opens default editor to edit the skill markdown file
```

### Delete Skills

```bash
hermes skills remove my-skill
hermes skills rm old-skill   # Short form
```

### Skill Format

Each skill is a markdown file at `~/.hermes/skills/<name>/skill.md`:

```markdown
---
name: my-skill
description: Skill description
triggers:
  - "trigger phrase 1"
  - "trigger phrase 2"
tags:
  - category1
  - category2
---

# Skill Name

## Steps
1. First step description
2. Second step description

## Best Practices
- Important notes
- Recommended approaches
```

---

## Plugin System

### Plugin Management

```bash
# List installed plugins
hermes plugins list
hermes plugins ls

# Install plugin (from Git)
hermes plugins install owner/repo
hermes plugins install https://github.com/owner/repo.git

# Update plugin
hermes plugins update plugin-name
hermes plugins update --all    # Update all

# Remove plugin
hermes plugins remove plugin-name
hermes plugins rm plugin-name

# Enable/disable plugin (keep installed but don't load)
hermes plugins enable plugin-name
hermes plugins disable plugin-name
```

### Plugin Types

```bash
# List general plugins
hermes plugins list --type general

# List memory providers
hermes plugins list --type memory

# List context engines
hermes plugins list --type context_engine
```

### Plugin Development

See [plugin-development.md](./plugin-development.md)

---

## Messaging Gateway

### Gateway Management

```bash
# Setup wizard
hermes gateway setup

# List configured gateways
hermes gateway list

# Install specific platform gateway
hermes gateway install telegram
hermes gateway install discord
hermes gateway install slack

# Start all gateways
hermes gateway start

# Stop all gateways
hermes gateway stop

# Restart specific gateway
hermes gateway restart discord
```

### Supported Messaging Platforms

| Platform | Gateway Name | Features |
|----------|-------------|----------|
| Telegram | `telegram` | Full support (text, voice, groups) |
| Discord | `discord` | Full support (voice channels) |
| Slack | `slack` | Supported |
| WhatsApp | `whatsapp` | Supported |
| Signal | `signal` | Supported |
| Matrix | `matrix` | Supported |
| Mattermost | `mattermost` | Supported |
| Email | `email` | Supported |
| SMS | `sms` | Supported |
| DingTalk | `dingtalk` | Supported |
| Feishu/Lark | `feishu` | Supported |
| WeCom | `wecom` | Supported |
| Home Assistant | `homeassistant` | Supported |

---

## Cron Jobs

### Task Management

```bash
# List all tasks
hermes cron list

# Create a task
hermes cron add \
  --name "Daily news summary" \
  --cron "0 9 * * *" \          # Every day at 9:00
  --message "Summarize today's tech news" \
  --skill daily-news             # Optional attached skill

# Pause a task
hermes cron pause TASK_ID or task-name

# Resume a task
hermes cron resume TASK_ID or task-name

# Edit a task
hermes cron edit TASK_ID

# Delete a task
hermes cron remove TASK_ID
hermes cron rm TASK_ID            # Short form

# Manually trigger a task
hermes cron run TASK_ID
```

### Cron Expression Syntax

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, 0=Sunday)
│ │ │ │ │
* * * * *
```

**Examples**:

| Expression | Meaning |
|------------|---------|
| `* * * * *` | Every minute |
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour |
| `0 9 * * *` | Daily at 9:00 |
| `0 9 * * 1` | Monday at 9:00 |
| `0 9 1 * *` | 1st of month at 9:00 |
| `0 9-17 * * 1-5` | Weekdays 9:00–17:00 each hour |

---

## MCP Integration

### Server Mode (expose capabilities to IDE)

```bash
# Start MCP Server
hermes mcp serve --port 8080
hermes mcp serve --stdio        # stdio mode

# Configure MCP Server
hermes mcp serve-config         # Generate IDE config snippet
```

### Client Mode (connect to external services)

```bash
# Connect to external MCP server
hermes mcp connect <server-config-json>

# List connected MCP services
hermes mcp list

# Disconnect
hermes mcp disconnect <server-id>
```

See [mcp-integration.md](./mcp-integration.md)

---

## Diagnostics & Debugging

### Status Check

```bash
# Quick status overview
hermes status

# Detailed diagnostics
hermes doctor
```

### Log Viewer

```bash
# Follow logs in real-time
hermes logs --follow
hermes logs -f

# View last N lines
hermes logs -n 100

# Filter by log level
hermes logs --level ERROR
hermes logs --level WARNING

# View specific session logs
hermes logs --session SESSION_ID
```

### Performance Analysis

```bash
# View recent performance metrics
hermes stats

# View token usage statistics
hermes stats tokens

# View task duration statistics
hermes stats timing
```

### Reset & Cleanup

```bash
# Clear cache
hermes cleanup cache

# Clean old sessions (older than N days)
hermes cleanup sessions --older-than 30

# Factory reset (⚠️ deletes all data and config)
hermes reset --factory
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HERMES_HOME` | Hermes data directory | `~/.hermes` |
| `HERMES_CONFIG` | Custom config file path | `~/.hermes/config.yaml` |
| `HERMES_ENV_FILE` | Custom env file path | `~/.hermes/.env` |
| `HERMES_LOG_LEVEL` | Log level | INFO |
| `HERMES_NO_COLOR` | Disable colored output | false |
| `HERMES_ENABLE_PROJECT_PLUGINS` | Enable project-level plugins | false |
| `HERMES_OPTIONAL_SKILLS` | Custom optional skills directory | null |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Argument error |
| 3 | Configuration error |
| 4 | Network error |
| 5 | API authentication failed |
| 124 | Timeout (from timeout command) |
| 130 | User interrupt (Ctrl+C) |
