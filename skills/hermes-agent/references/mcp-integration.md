# Hermes Agent MCP Integration Guide

> **Version**: v0.8.0 | **Last Updated**: 2026-04-11

## Table of Contents

1. [MCP Protocol Overview](#mcp-protocol-overview)
2. [Bidirectional Integration Architecture](#bidirectional-integration-architecture)
3. [Server Mode (Expose Capabilities)](#server-mode-expose-capabilities)
4. [Client Mode (Connect External Services)](#client-mode-connect-external-services)
5. [Tool Filtering & Security](#tool-filtering--security)
6. [IDE Configuration](#ide-configuration)
7. [Advanced Usage](#advanced-usage)
8. [Troubleshooting](#troubleshooting)

---

## MCP Protocol Overview

**Model Context Protocol (MCP)** is an open standard that allows AI applications to communicate with external data sources and tools in a standardized way. Hermes Agent supports **bidirectional** MCP integration since v0.6.0.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **MCP Server** | Server that provides capabilities and resources |
| **MCP Client** | Client that connects to and uses MCP Server capabilities |
| **Tool** | Function callable by an LLM |
| **Resource** | Data that can be read (files, URIs, etc.) |
| **Prompt** | Prompt templates that can be injected |

---

## Bidirectional Integration Architecture

### Architecture Diagram

```
                         ┌─────────────────────────┐
                         │      Agent / IDE         │
                         │        (Client)          │
                         └───────────┬─────────────┘
                                     │ MCP Protocol
                                     ▼
                    ┌────────────────────────────────┐
                    │        Hermes Agent             │
                    │                                │
                    │  ┌─────────────────────────┐   │
                    │  │   MCP Server Mode        │   │
                    │  │  (Expose Hermes          │   │
                    │  │   capabilities)          │   │
                    │  │  - 47+ tools            │   │
                    │  │  - Memory system        │   │
                    │  │  - Skill system         │   │
                    │  └─────────────────────────┘   │
                    │                                │
                    │  ┌─────────────────────────┐   │
                    │  │   MCP Client Mode        │   │
                    │  │  (Connect external       │   │
                    │  │   services)              │   │
                    │  │  - Databases            │   │
                    │  │  - API services         │   │
                    │  │  - File systems         │   │
                    │  └─────────────────────────┘   │
                    └────────────────────────────────┘
```

### Use Cases

| Scenario | Mode | Description |
|----------|------|-------------|
| IDE integration | Server | Call Hermes from Cursor/Windsurf |
| Extend capabilities | Client | Let Hermes use external databases/APIs |
| Bidirectional bridge | Both | Act as both Server and Client simultaneously |

---

## Server Mode (Expose Capabilities)

### Start MCP Server

```bash
# Method 1: stdio mode (recommended for IDE integration)
hermes mcp serve --stdio

# Method 2: HTTP server mode
hermes mcp serve --port 8080

# Method 3: With configuration options
hermes mcp serve --stdio \
  --allowed-tools "web_search,memory,delegation" \
  --max-tokens 4096 \
  --model "anthropic/claude-haiku"
```

### Server Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `--port` | 8080 | HTTP mode port (HTTP mode only) |
| `--stdio` | false | Use stdio mode (recommended) |
| `--model` | config default | Force a specific model |
| `--max-tokens` | config default | Max output tokens |
| `--temperature` | config default | Temperature parameter |
| `--allowed-tools` | all | Comma-separated list of tools to expose |
| `--blocked-tools` | none | Comma-separated list of tools to block |
| `--enable-memory` | true | Expose memory-related tools |
| `--enable-delegation` | true | Expose sub-agent delegation tools |
| `--require-authentication` | false | Require authentication token |
| `--auth-token` | auto-generated | Authentication token |

### Exposed Tools

When running in Server mode, the following tools are exposed to MCP clients:

#### Core Tools

| Tool Name | Parameters | Description |
|-----------|-----------|-------------|
| `run_task` | task, context? | Run a full task (equivalent to `hermes run`) |
| `search_memory` | query, limit? | Search historical memory |
| `add_note` | content, tags? | Add a new note |
| `list_notes` | tag_filter? | List all notes |
| `delegate_task` | task, tools?, timeout? | Create sub-agent to execute task |
| `list_skills` | — | List learned skills |
| `create_skill` | name, description, content? | Create a new skill |
| `web_search` | query, num_results? | Web search |
| `read_file` | path, offset?, limit? | Read file contents |
| `write_file` | path, content | Write to a file |
| `execute_command` | command, timeout? | Execute terminal command |
| `browser_navigate` | url | Navigate browser to URL |
| `browser_click` | selector | Click page element |
| `browser_extract` | selector, extract_type? | Extract page data |

---

## Client Mode (Connect External Services)

### Connect MCP Server

```bash
# Method 1: Via command line
hermes mcp connect --name my-database \
  --type sse \
  --url http://localhost:3000/sse

# Method 2: Via JSON config
hermes mcp connect '{
  "name": "postgres-db",
  "type": "sse",
  "url": "http://localhost:3000/mcp",
  "headers": {"Authorization": "Bearer token123"}
}'

# Method 3: Load from config file
hermes mcp connect --config ./mcp-servers.json
```

### Config File Format (`~/.hermes/mcp_servers.json`)

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres",
               "postgresql://user:pass@localhost:5432/mydb"],
      "env": {}
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem",
               "/path/to/allowed/directory"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-...",
        "SLACK_APP_TOKEN": "xapp-..."
      }
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-key"
      }
    },
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

### Manage MCP Connections

```bash
# List connected MCP services
hermes mcp list

# Show available tools for a service
hermes mcp tools database

# Disconnect
hermes mcp disconnect database

# Disconnect all
hermes mcp disconnect --all

# Test connection
hermes mcp test database
```

---

## Tool Filtering & Security

### Server-Side Tool Filtering

When Hermes runs as an MCP Server, you can restrict exposed tools:

```bash
# Expose only specific tools
hermes mcp serve --stdio \
  --allowed-tools "run_task,search_memory,web_search"

# Block dangerous tools
hermes mcp serve --stdio \
  --blocked-tools "execute_command,write_file,browser_*"

# Combined
hermes mcp serve --stdio \
  --allowed-tools "run_task,search_memory,list_notes" \
  --blocked-tools ""
```

### Client-Side Tool Namespacing

Tools from MCP Client connections are automatically prefixed with a namespace:

```bash
# Assuming postgres and github MCP Servers are connected

# Tools from postgres:
postgres:query
postgres:list_tables
postgres:get_schema

# Tools from github:
github:search_issues
github:create_issue
github:get_file_contents

# Hermes built-in tools remain unchanged:
run_task
search_memory
delegate_task
```

### Security Best Practices

```yaml
# ~/.hermes/config.yaml
security:
  mcp:
    # Server mode settings
    server:
      require_authentication: true
      auth_token_env: HERMES_MCP_AUTH_TOKEN
      allowed_origins:            # CORS whitelist
        - "vscode-webview://*"
        - "windsurf://*"

    # Client mode settings
    client:
      allow_untrusted_servers: false  # Only allow preconfigured servers
      timeout_per_tool: 60           # Per-MCP-tool timeout

    # Audit logging
    audit_log:
      enabled: true
      log_mcp_calls: true
      include_params: false          # Don't log sensitive params
```

---

## IDE Configuration

### Cursor

In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hermes": {
      "command": "hermes",
      "args": ["mcp", "serve", "--stdio",
               "--allowed-tools", "run_task,search_memory,web_search,read_file,write_file"]
    }
  }
}
```

### VS Code + Claude Code

In `.vscode/settings.json` or Claude Code config:

```json
{
  "mcpServers": {
    "hermes-agent": {
      "command": "/Users/username/.local/bin/hermes",
      "args": [
        "mcp",
        "serve",
        "--stdio",
        "--model", "anthropic/claude-haiku",
        "--allowed-tools", "run_task,search_memory,web_search,file_operations,execute_code"
      ]
    }
  }
}
```

### Windsurf

In `.windsurf/mcp.json`:

```json
{
  "servers": {
    "hermes": {
      "command": "hermes",
      "args": ["mcp", "serve", "--stdio"]
    }
  }
}
```

### Zed Editor

In `settings.json`:

```json
{
  "mcp_servers": {
    "hermes": {
      "command": "hermes",
      "args": ["mcp", "serve", "--stdio"]
    }
  }
}
```

---

## Advanced Usage

### 1. Multi-Instance Deployment

Run multiple Hermes MCP Servers with different models:

```bash
# Instance 1: Lightweight quick tasks (Haiku)
HERMES_MCP_PORT=8081 hermes mcp serve --port 8081 \
  --model anthropic/claude-haiku \
  --allowed-tools "run_task,search_memory" &

# Instance 2: Deep research (Sonnet)
HERMES_MCP_PORT=8082 hermes mcp serve --port 8082 \
  --model anthropic/claude-sonnet \
  --allowed-tools "run_task,web_search,browser,delegation" &

# Instance 3: Code tasks (GPT-4o)
HERMES_MCP_PORT=8083 hermes mcp serve --port 8083 \
  --model openai/gpt-4o \
  --allowed-tools "run_task,file_operations,code_execution,terminal" &
```

Connect to different ports from different IDE instances.

### 2. Chained MCP Calls

Hermes as a middleware layer, chaining multiple MCP services:

```
IDE → Hermes MCP Server → [Hermes internal processing]
                           ↓
                    Hermes MCP Client A → PostgreSQL
                    Hermes MCP Client B → GitHub API
                    Hermes MCP Client C → Slack
```

Hermes intelligently selects which external MCP tool to invoke based on task requirements.

### 3. Custom Tool Wrapping

Wrap external MCP tools as Hermes native skills:

```python
# Wrapper script example
def wrap_mcp_tool(ctx, tool_name, params):
    """
    Wrap MCP tool calls as Hermes skills
    """
    result = call_mcp_client("my-server", tool_name, params)

    # Post-process result
    if tool_name.startswith("db:"):
        return format_as_markdown_table(result)
    elif tool_name.startswith("gh:"):
        return format_github_result(result)

    return result

ctx.register_tool(
    name="query_database_via_mcp",
    schema=db_schema,
    handler=lambda p: wrap_mcp_tool(ctx, f"db:query", p)
)
```

### 4. Performance Optimization

```yaml
# config.yaml
mcp:
  server:
    # Cache common query results
    cache_enabled: true
    cache_ttl: 300          # Cache TTL (seconds)

    # Concurrency control
    max_concurrent_requests: 5

    # Streaming responses
    streaming_enabled: true

  client:
    # Connection pool
    connection_pool_size: 10

    # Retry strategy
    retry_attempts: 3
    retry_backoff: 1s

    # Request timeout
    request_timeout: 30s
```

---

## Troubleshooting

### Q: MCP Server fails to start

```bash
# Check dependencies
hermes doctor

# Check MCP-related logs
hermes logs --level ERROR | grep -i mcp

# Manually test stdio mode
echo '{"jsonrpc":"2.0","method":"initialize","params":{"capabilities":{}},"id":1}' | hermes mcp serve --stdio
```

### Q: IDE can't connect to MCP Server

1. **Check PATH**: Ensure `hermes` is in your PATH
2. **Check permissions**: Ensure IDE can execute shell commands
3. **Check arguments**: Ensure `args` array format is correct
4. **Test connection**: Manually run the same command in terminal

```bash
# Cursor/VS Code debugging method
hermes mcp serve --stdio &
# Send JSON-RPC test message
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Q: MCP Client connection timeout

```bash
# Test if external MCP Server is reachable
curl -v http://localhost:3000/sse

# Check network config
hermes mcp test <server-name>

# Increase timeout
hermes mcp connect ... --timeout 120
```

### Q: Tool name conflicts

When Hermes built-in tools and MCP Client tools have the same name, MCP tools are automatically prefixed. To customize:

```yaml
mcp:
  client:
    namespace_prefix: true           # Enable namespace prefix (default: on)
    namespace_separator: ":"         # Separator
    conflict_resolution: "prefix"    # prefix | rename | error
```

### Debug Mode

```bash
# Enable verbose debug logging
HERMES_LOG_LEVEL=DEBUG hermes mcp serve --stdio

# View all MCP communication
hermes logs --follow | grep -i mcp
```

---

## Reference Resources

- **MCP Specification**: https://modelcontextprotocol.io/
- **Official SDK**: https://github.com/modelcontextprotocol/python-sdk
- **Community Servers**: https://mcp.so/
- **Hermes MCP Source**: `mcp_serve.py`
