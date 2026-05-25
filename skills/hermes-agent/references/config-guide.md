# Hermes Agent Configuration Guide

> **Version**: v0.8.0 | **Last Updated**: 2026-04-11

## Table of Contents

1. [API Key Configuration](#api-key-configuration)
2. [Model Configuration](#model-configuration)
3. [Provider Settings](#provider-settings)
4. [Toolset Configuration](#toolset-configuration)
5. [Memory System Configuration](#memory-system-configuration)
6. [Gateway Configuration](#gateway-configuration)
7. [Security Configuration](#security-configuration)
8. [Complete Config Example](#complete-config-example)

---

## API Key Configuration

### Environment Variables File (`~/.hermes/.env`)

This is the primary location for all sensitive credentials. **Do not commit this file to version control!**

```bash
# ========================================
# Required: configure at least one LLM provider
# ========================================

# OpenRouter (recommended, supports 200+ models)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Or use another provider:
# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# OpenAI (GPT-4o, etc.)
OPENAI_API_KEY=sk-openai-your-key-here

# Google (Gemini)
GOOGLE_API_KEY=your-google-api-key

# ========================================
# Optional: enhanced capabilities
# ========================================

# Firecrawl - advanced web scraping (more powerful than built-in search)
FIRECRAWL_API_KEY=fc-your-firecrawl-key

# FAL.ai - image generation (FLUX models)
FAL_KEY=your-fal-api-key

# ElevenLabs - advanced TTS (replaces free Edge TTS)
ELEVENLABS_API_KEY=your-elevenlabs-key

# Brave Search - web search
BRAVE_API_KEY=your-brave-search-key

# OpenWeatherMap - weather queries
OPENWEATHERMAP_API_KEY=your-weather-key

# GitHub Token - for GitHub integration
GITHUB_TOKEN=ghp_your-github-token

# ========================================
# Optional: messaging platforms
# ========================================

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Discord Bot
DISCORD_BOT_TOKEN=your-discord-bot-token

# Slack Bot
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_APP_TOKEN=xapp-your-slack-app-token

# WhatsApp Bridge (requires separate setup)
# Docs: https://hermes-agent.nousresearch.com/docs/gateways/whatsapp/
```

### Getting API Keys

| Service | URL | Free Tier |
|---------|-----|-----------|
| **OpenRouter** | https://openrouter.ai/keys | Small credit on signup |
| **Anthropic** | https://console.anthropic.com/ | $5 free for new users |
| **OpenAI** | https://platform.openai.com/api-keys | $5 free for new users |
| **Google AI** | https://aistudio.google.com/apikey | Free tier available |
| **Firecrawl** | https://www.firecrawl.dev/account | 500 free scrapes |
| **FAL.ai** | https://fal.ai/dashboard/keys | Daily free credits |
| **ElevenLabs** | https://elevenlabs.io/app/settings/api-keys | 10k chars/month free |
| **Brave Search** | https://brave.com/search/api/ | 2k queries/month free |

---

## Model Configuration

### CLI Model Selection

```bash
# Launch interactive model selection wizard
hermes model
```

### Config File Model Settings

Edit `~/.hermes/config.yaml`:

```yaml
model:
  # LLM provider
  provider: openrouter

  # Model name
  # OpenRouter format: <provider>/<model-name>
  model: anthropic/claude-sonnet-4-20250514

  # Or use native provider names:
  # model: claude-3-5-sonnet-20241022    # Anthropic direct
  # model: gpt-4o                        # OpenAI direct

  # Temperature (0.0 = deterministic, 2.0 = max randomness)
  temperature: 0.7

  # Max output tokens
  max_tokens: 4096

  # Top P sampling
  top_p: 1.0

  # Enable streaming
  streaming: true
```

### Recommended Models

#### Best Value

| Model | Cost ($/1M tokens) | Notes |
|-------|---------------------|-------|
| `openrouter/google/gemini-flash-1.5` | ~$0.07 | Cheapest, fast |
| `openrouter/meta-llama/llama-3.1-8b-instruct:free` | Free | Open-source, simple tasks |
| `anthropic/claude-haiku-4-5-20251001` | ~$0.80 | Fast, good quality |

#### Best Quality

| Model | Cost ($/1M tokens) | Notes |
|-------|---------------------|-------|
| `anthropic/claude-sonnet-4-20250514` | ~$3.00 | Balanced quality/cost |
| `openai/gpt-4o` | ~$2.50 | Strong multimodal |
| `google/gemini-2.5-pro` | ~$6.25 | Strong reasoning, long context |

#### Specialized

| Use Case | Recommended Model | Reason |
|----------|-------------------|--------|
| Code generation | `anthropic/claude-sonnet-4-20250514` | Excellent code ability |
| Web research | `google/gemini-2.5-pro` | Large context window |
| Creative writing | `openai/gpt-4o` | Diverse literary style |
| Quick Q&A | `anthropic/claude-haiku-4-5-20251001` | Fast, low cost |
| Data analysis | `openai/o4-mini` | Strong reasoning |

---

## Provider Settings

### OpenRouter (Recommended)

```yaml
providers:
  openrouter:
    base_url: "https://openrouter.ai/api/v1"
    api_key_env: OPENROUTER_API_KEY  # Read from .env
    models:
      default: "anthropic/claude-sonnet-4-20250514"

    # Advanced options
    timeout: 120                    # Request timeout (seconds)
    max_retries: 3                  # Retry count

    # HTTP Headers (optional)
    extra_headers:
      X-Title: "Hermes Agent"
      HTTP-Referer: "http://localhost:8080"
```

### Anthropic Direct

```yaml
providers:
  anthropic:
    api_key_env: ANTHROPIC_API_KEY
    models:
      default: "claude-sonnet-4-20250514"
    base_url: "https://api.anthropic.com"
```

### OpenAI Direct

```yaml
providers:
  openai:
    api_key_env: OPENAI_API_KEY
    models:
      default: "gpt-4o"
    base_url: "https://api.openai.com/v1"
```

### Ollama (Local Model, Zero Cost)

```yaml
providers:
  ollama:
    base_url: "http://localhost:11434/v1"
    models:
      default: "llama3.1:8b"        # Run ollama pull llama3.1:8b first
    api_key: "ollama"               # Ollama doesn't need a real API key
    # No API key needed, fully offline
```

---

## Toolset Configuration

### Enable / Disable Toolsets

```yaml
tools:
  # Global default enabled state
  enabled_by_default: true

  # Toolset definitions
  toolsets:
    web_search:
      enabled: true
      tools:
        - search_web
        - firecrawl_scrape

    browser:
      enabled: true
      backend: local_chrome       # browserbase_cloud | browser_use_cloud | local_chrome | local_chromium

    file_operations:
      allowed_paths:
        - /Users/username/Projects
        - /tmp
        - ~/Documents
      denied_paths:
        - ~/.ssh
        - ~/.gnupg
        - /etc

    terminal:
      allowed_commands:
        - git
        - npm
        - python
        - cat
        - ls
        - grep
        - find
      denied_commands:
        - rm -rf /
        - sudo
        - chmod 777

    memory:
      enabled: true
      backend: built-in           # built-in | honcho | mem0 | ...

    code_execution:
      enabled: true
      sandbox: docker             # docker | subprocess

    delegation:
      enabled: true
      max_concurrent: 3           # Max concurrent sub-agents
      default_timeout: 300        # Default timeout (seconds)

    image_generation:
      enabled: false              # Requires FAL_KEY
      provider: fal               # fal | ...
      model: flux-2-pro
      upscale: true               # Auto 2x upscale

    voice:
      enabled: true
      tts_provider: edge_tts      # edge_tts | elevenlabs | openai_tts | minimax | neutts
      stt_provider: whisper       # whisper | groq_whisper
```

---

## Memory System Configuration

```yaml
memory:
  # Backend selection
  provider: built-in             # built-in | honcho | mem0 | openviking | hindsight | holographic | retaindb | byte-rover

  # Built-in backend specific config
  built_in:
    storage_path: ~/.hermes/memory
    fts_enabled: true            # Enable full-text search
    max_notes: 10000             # Max notes count
    auto_summarize: true         # Auto-summarize old sessions
    summary_model: haiku         # Model used for summarization

  # Honcho backend (if used)
  honcho:
    project_id: your-project-id
    dialect_name: user-profile   # User dialect filename

  # Retention policy
  retention:
    hot_memory_days: 7           # Hot memory retention (days)
    session_history_days: 30     # Session history retention (days)
    cold_storage_after: 90       # Days before archival
    auto_prune: true             # Auto-clean expired memory
```

---

## Gateway Configuration

### Telegram Example

```yaml
gateway:
  telegram:
    enabled: true
    bot_token_env: TELEGRAM_BOT_TOKEN
    allowed_users:                # Limit available users (optional)
      - 123456789
    allowed_groups:               # Limit groups (optional)
      - -1001234567890
    commands:
      start: "Welcome to Hermes Agent! Send me a question to start."
      help: "Available commands:\n/ask <question>\n/memory search <keyword>\n/status"
    features:
      voice: true                 # Support voice messages
      image_analysis: true        # Analyze images
      inline_queries: true        # Inline mode
```

### Discord Example

```yaml
gateway:
  discord:
    enabled: true
    bot_token_env: DISCORD_BOT_TOKEN
    command_prefix: "!"           # Command prefix
    allowed_guilds:              # Limit servers
      - "123456789012345678"
    voice_channels:              # Support voice channels
      enabled: true
    features:
      slash_commands: true       # Slash commands
      context_menus: true        # Right-click menus
      message_content: true      # Message content intent (enable in Discord Developer Portal)
```

---

## Security Configuration

```yaml
security:
  # Prompt injection protection
  prompt_injection_protection:
    enabled: true                 # v0.7.0+ enabled by default
    strictness: medium            # low | medium | high

  # Credential filtering
  credential_filtering:
    enabled: true
    patterns:                    # Patterns to filter
      - "(?i)(api[_-]?key|token|secret|password)[=:]\s*\S+"
      - "sk-[a-zA-Z0-9]{20,}"
      - "ghp_[a-zA-Z0-9]{36}"

  # Tool permission control
  tool_permissions:
    terminal:
      require_confirmation:
        - "rm "
        - "sudo"
        - "chmod 777"
        - "curl.*\\| bash"

  # Audit logging
  audit_logging:
    enabled: true
    log_tool_calls: true
    log_file_access: true
    log_network_requests: true

  # Network access control
  network:
    allowed_domains:             # Whitelist (empty = allow all)
      - "*.openai.com"
      - "*.anthropic.com"
      - "*.openrouter.ai"
    blocked_domains:              # Blacklist
      - "*.malicious-site.com"
```

---

## Complete Configuration Example

A production-ready complete config:

```yaml
# ============================================
# Hermes Agent Full Configuration Example
# File location: ~/.hermes/config.yaml
# ============================================

# --- Core Model Settings ---
model:
  provider: openrouter
  model: anthropic/claude-sonnet-4-20250514
  temperature: 0.7
  max_tokens: 8192
  top_p: 1.0
  streaming: true

# --- Providers ---
providers:
  openrouter:
    base_url: "https://openrouter.ai/api/v1"
    api_key_env: OPENROUTER_API_KEY
    timeout: 120
    max_retries: 3
    extra_headers:
      X-Title: "My Hermes Instance"

# --- Toolsets ---
tools:
  enabled_by_default: true
  toolsets:
    web_search:
      enabled: true
    browser:
      enabled: true
      backend: local_chrome
    file_operations:
      allowed_paths:
        - ~/Projects
        - /tmp
        - ~/Documents
      denied_paths:
        - ~/.ssh
        - ~/.gnupg
    terminal:
      enabled: true
      allowed_commands:
        - git
        - npm
        - python
        - node
        - make
        - cat
        - ls
        - grep
        - find
        - head
        - tail
        - wc
        - sed
        - awk
    memory:
      enabled: true
      provider: built-in
    code_execution:
      enabled: true
    delegation:
      enabled: true
      max_concurrent: 3
      default_timeout: 300
    image_generation:
      enabled: false
    voice:
      enabled: true
      tts_provider: edge_tts

# --- Memory System ---
memory:
  provider: built-in
  retention:
    hot_memory_days: 7
    session_history_days: 30
    cold_storage_after: 90
    auto_prune: true

# --- Security ---
security:
  prompt_injection_protection:
    enabled: true
    strictness: medium
  credential_filtering:
    enabled: true
  tool_permissions:
    terminal:
      require_confirmation:
        - "rm -rf"
        - "sudo"
        - "curl.*\\| bash"
        - "wget.*\\| sh"
  audit_logging:
    enabled: true

# --- Gateway (enable as needed) ---
gateway:
  telegram:
    enabled: false
  discord:
    enabled: false

# --- UI Settings ---
ui:
  theme: dark                   # dark | light
  color_output: true
  show_thinking: false          # Show thinking process
  timestamp_format: "%Y-%m-%d %H:%M:%S"
```

---

## Common Configuration Questions

### Q: How to switch models?

```bash
# Method 1: Interactive
hermes model

# Method 2: CLI temporary override
hermes run "prompt" --model gpt-4o --non-interactive

# Method 3: Edit config file
nano ~/.hermes/config.yaml  # Change model.model field
```

### Q: How to reduce costs?

1. Use cheaper models (Haiku, Flash)
2. Reduce max tokens
3. Limit enabled toolsets (fewer function calls)
4. Use cache-friendly prompts
5. Consider Ollama local models (zero API cost)

### Q: How to fix "API key invalid"?

1. Check `~/.hermes/.env` for correct key
2. Verify key hasn't expired or hit quota
3. Run `hermes doctor` to diagnose
4. Try switching to a backup provider

### Q: How to share one Hermes across multiple projects?

Create a project-level `.hermes/config.yaml`:

```bash
cd my-project
mkdir -p .hermes
cat > .hermes/config.yaml << EOF
model:
  provider: openrouter
  model: anthropic/claude-sonnet-4-20250514
EOF

HERMES_ENABLE_PROJECT_AGENTS=true hermes
```
