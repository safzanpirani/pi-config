# Hermes Agent Plugin Development Guide

> **Version**: v0.8.0 | **Last Updated**: 2026-04-11

## Table of Contents

1. [Plugin Overview](#plugin-overview)
2. [Directory Structure](#directory-structure)
3. [Plugin Types](#plugin-types)
4. [Development Workflow](#development-workflow)
5. [API Reference](#api-reference)
6. [Hook System](#hook-system)
7. [Publishing & Distribution](#publishing--distribution)
8. [Example Plugins](#example-plugins)

---

## Plugin Overview

Hermes' plugin system lets users extend functionality without modifying core code:

| Capability | Description |
|------------|-------------|
| **Custom Tools** | Add new LLM-callable tools |
| **Lifecycle Hooks** | Execute custom logic at key event points |
| **CLI Command Extensions** | Add `hermes <subcommand>` subcommands |
| **Skill Bundling** | Distribute skill files with plugins |
| **Data File Packaging** | Include configs, templates, etc. |

---

## Directory Structure

```
my-plugin/
├── plugin.yaml          # Plugin manifest (required)
├── __init__.py          # Registration function (required)
├── schemas.py           # Tool schema definitions
├── tools.py             # Tool handler implementations
├── data/                # Data files (optional)
│   └── config.json
└── skill.md             # Bundled skill (optional)
```

### plugin.yaml Format

```yaml
name: my-plugin-name           # Plugin identifier (required)
version: "1.0.0"              # Semantic version (required)
description: Brief description  # User-visible description (recommended)
author: Your Name              # Author info (optional)
requires_env: []               # Required env vars (optional, prompted on install)

# Plugin type (auto-detected, usually not needed)
type: general                  # general | memory_provider | context_engine

# Compatibility
hermes_min_version: "0.7.0"   # Minimum compatible version (optional)
license: MIT                   # License (optional)
repository: https://github.com/user/repo  # Git repo (optional)
```

### __init__.py Registration Function

```python
"""
My Hermes Plugin - description
"""

def register(ctx):
    """
    Main registration function. Called by Hermes when loading the plugin.

    Args:
        ctx (PluginContext): Plugin context object providing:
            - ctx.register_tool(name, schema, handler): Register a tool
            - ctx.register_hook(event_name, callback): Register a hook
            - ctx.register_cli_command(name, help, setup_fn, handler_fn): Register CLI command
            - ctx.inject_message(content, role="user"): Inject a message
    """

    # Import your tool definitions and handlers
    from .schemas import tool_schema
    from .tools import handle_tool_call

    # Register custom tool
    ctx.register_tool("my_tool_name", tool_schema, handle_tool_call)

    # Register hook (optional)
    def on_tool_complete(tool_name, params, result):
        print(f"[my-plugin] Tool {tool_name} completed")

    ctx.register_hook("post_tool_call", on_tool_complete)
```

---

## Plugin Types

### 1. General Plugin

The most flexible type, can add any number of tools and hooks.

```yaml
# plugin.yaml
name: weather-plugin
version: "1.0.0"
description: Weather query plugin
```

```python
# __init__.py
from .schemas import get_weather_schema
from .tools import get_weather_handler

def register(ctx):
    ctx.register_tool("get_weather", get_weather_schema, get_weather_handler)
```

### 2. Memory Provider

Replace or enhance the built-in memory system.

```yaml
# plugin.yaml
name: custom-memory
version: "1.0.0"
description: Custom memory backend
type: memory_provider
```

```python
# __init__.py
def register(ctx):
    """
    Memory providers must implement:
    - search(query) -> List[Note]
    - add(note) -> Note
    - list_notes() -> List[Note]
    - delete(note_id) -> bool
    """
    class CustomMemoryBackend:
        def search(self, query):
            # Your search implementation
            pass

        def add(self, content, tags=None):
            # Your add implementation
            pass

    ctx.set_memory_backend(CustomMemoryBackend())
```

**Available memory providers**:

| Backend | Features |
|---------|----------|
| `built-in` | Default, SQLite + FTS5 |
| `honcho` | AI-native dialect modeling |
| `mem0` | Open-source memory service |
| `openviking` | Advanced vector retrieval |
| `hindsight` | Timeline memory |
| `holographic` | Holographic memory system |

### 3. Context Engine

Replace the built-in context compressor.

```yaml
# plugin.yaml
name: smart-context
version: "1.0.0"
description: Smart context compression
type: context_engine
```

```python
# __init__.py
def register(ctx):
    class SmartContextEngine:
        def compress(self, messages, max_tokens):
            # Custom context compression logic
            pass

        def summarize(self, text, target_length):
            # Custom summarization logic
            pass

    ctx.set_context_engine(SmartContextEngine())
```

---

## Development Workflow

### Step 1: Create Plugin Skeleton

```bash
mkdir -p ~/.hermes/plugins/my-plugin
cd ~/.hermes/plugins/my-plugin
touch plugin.yaml __init__.py schemas.py tools.py
```

### Step 2: Write plugin.yaml

```yaml
name: my-awesome-plugin
version: "0.1.0"
description: My first Hermes plugin
author: Your Name
```

### Step 3: Define Tool Schema (schemas.py)

```python
"""
Tool schema definitions — the interface the LLM sees
"""

tool_schema = {
    "name": "awesome_tool",
    "description": "What this tool does",
    "parameters": {
        "type": "object",
        "properties": {
            "param1": {
                "type": "string",
                "description": "Description of param1",
            },
            "param2": {
                "type": "integer",
                "description": "Description of param2",
                "default": 10,
            },
            "options": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of options",
            }
        },
        "required": ["param1"],
    }
}
```

### Step 4: Implement Tool Handler (tools.py)

```python
"""
Tool handlers — the actual execution logic
"""

import json

def handle_tool_call(params: dict) -> str:
    """
    Handle a tool call.

    Args:
        params: Dictionary of parameters received from the LLM call

    Returns:
        str: Result string returned to the LLM (appended to conversation history)
    """
    param1 = params.get("param1", "")
    param2 = params.get("param2", 10)
    options = params.get("options", [])

    try:
        # === Implement your business logic here ===

        result = f"Result: param1={param1}, param2={param2}"

        if options:
            result += f", options={', '.join(options)}"

        return result

    except Exception as e:
        # Error handling: return meaningful error to the LLM
        return f"Error: execution failed — {str(e)}"

# Multiple tools can be defined
another_tool_schema = {
    "name": "another_tool",
    "description": "Another tool",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Query content"}
        },
        "required": ["query"]
    }
}

def another_handler(params: dict) -> str:
    query = params.get("query", "")
    return f"Query '{query}' result is..."
```

### Step 5: Register in __init__.py

```python
"""My Awesome Plugin for Hermes Agent."""

def register(ctx):
    """Register all tools and hooks with Hermes."""

    # Import local modules
    from .schemas import tool_schema, another_tool_schema
    from .tools import handle_tool_call, another_handler

    # Register tool 1
    ctx.register_tool(
        name="awesome_tool",
        schema=tool_schema,
        handler=handle_tool_call
    )

    # Register tool 2
    ctx.register_tool(
        name="another_tool",
        schema=another_tool_schema,
        handler=another_handler
    )

    # Register hook (optional)
    def log_tool_usage(tool_name, params, result):
        """Log every tool call to a file"""
        import json
        from datetime import datetime

        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "tool": tool_name,
            "params": params,
            "success": not str(result).startswith("Error")
        }

        with open("/tmp/plugin-tool-usage.log", "a") as f:
            f.write(json.dumps(log_entry) + "\n")

    ctx.register_hook("post_tool_call", log_tool_usage)

    # Register CLI command (optional)
    def setup_parser(parser):
        """Set up CLI argument parser"""
        parser.add_argument("--verbose", action="store_true")
        parser.add_argument("--output-format", choices=["json", "text"], default="text")

    def cmd_handler(args):
        """Handle CLI command"""
        print(f"My plugin running with verbose={args.verbose}")

    ctx.register_cli_command(
        name="my-plugin",
        help="Custom command for my plugin",
        setup_fn=setup_parser,
        handler_fn=cmd_handler
    )
```

### Step 6: Install and Test

```bash
# Install from local path
hermes plugins install /path/to/my-plugin

# Or install from Git
hermes plugins install https://github.com/you/my-plugin.git

# Enable plugin
hermes plugins enable my-plugin

# Test plugin loaded
hermes plugins list

# Test in conversation
hermes run "Use awesome_tool with param1=test" --non-interactive --no-stream
```

---

## API Reference

### PluginContext API

#### `ctx.register_tool(name, schema, handler)`

Register a tool callable by the LLM.

**Parameters**:
- `name` (str): Tool name, globally unique
- `schema` (dict): JSON Schema tool definition
- `handler` (callable): Handler function `(params: dict) -> str`

**Example**:
```python
ctx.register_tool("my_tool", {...}, lambda p: "result")
```

#### `ctx.register_hook(event_name, callback)`

Register lifecycle hooks.

**Available Events**:

| Event Name | Callback Signature | When Triggered |
|------------|-------------------|----------------|
| `pre_tool_call` | `(tool_name, params)` | Before tool execution |
| `post_tool_call` | `(tool_name, params, result)` | After tool execution |
| `pre_llm_call` | `(messages, kwargs)` | Before LLM call, can return `{"context": "..."}` |
| `post_llm_call` | `(response, messages)` | After successful LLM call |
| `on_session_start` | `(session_id)` | When a new session is created |
| `on_session_end` | `(session_id)` | When a session ends |

#### `ctx.register_cli_command(name, help, setup_fn, handler_fn)`

Register a CLI subcommand.

**Parameters**:
- `name` (str): Command name (e.g., `my-cmd`, invoked as `hermes my-cmd`)
- `help` (str): Help text
- `setup_fn` (callable): Set up argument parser `(parser) -> None`
- `handler_fn` (callable): Handle command `(args) -> None`

#### `ctx.inject_message(content, role="user")`

Inject a message into the current session.

**Example**:
```python
ctx.inject_message("Note: User prefers responses in Chinese.", role="system")
```

---

## Hook System

### Hook Execution Order

```
User input → pre_llm_call → [LLM Call] → post_llm_call
                                    ↓
                              Parse tool calls
                                    ↓
                          pre_tool_call → [Tool Execute] → post_tool_call
                                    ↓
                              Return response
```

### Advanced Hook Usage

#### 1. Context Injection

Inject context before every LLM call:

```python
def inject_user_preferences(messages, kwargs):
    """Inject user preference context"""
    preferences = load_user_preferences()  # Your function

    context_text = (
        f"Current user preferences:\n"
        f"- Language: {preferences['language']}\n"
        f"- Timezone: {preferences['timezone']}\n"
        f"- Domain: {preferences['domain']}\n"
    )

    return {"context": context_text}

ctx.register_hook("pre_llm_call", inject_user_preferences)
```

#### 2. Tool Call Audit

Log all tool calls:

```python
def audit_tool_calls(tool_name, params, result):
    """Audit all tool calls"""
    import logging

    logger = logging.getLogger("plugin.audit")
    logger.info({
        "tool": tool_name,
        "params": params,
        "result_length": len(str(result)),
        "timestamp": time.time()
    })

ctx.register_hook("post_tool_call", audit_tool_calls)
```

#### 3. Destructive Action Confirmation

Double-check dangerous operations:

```python
def confirm_destructive_actions(tool_name, params):
    """Intercept destructive operations"""
    destructive_patterns = [
        ("file_delete", ["rm", "delete"]),
        ("execute_command", ["rm -rf", "sudo"]),
    ]

    for t_tool, t_keywords in destructive_patterns:
        if tool_name == t_tool:
            for kw in t_keywords:
                params_str = str(params).lower()
                if kw in params_str:
                    raise PermissionError(
                        f"⚠️ Dangerous operation blocked: {tool_name} contains keyword '{kw}'"
                    )

ctx.register_hook("pre_tool_call", confirm_destructive_actions)
```

---

## Publishing & Distribution

### Local Installation

```bash
# Install from local directory
hermes plugins install /path/to/my-plugin

# Or cop to plugin directory
cp -r my-plugin ~/.hermes/plugins/
hermes plugins enable my-plugin
```

### Git Distribution

```bash
# Install from GitHub
hermes plugins install owner/repo
hermes plugins install https://github.com/owner/repo.git

# From private repo (requires auth)
hermes plugins install git@github.com:owner/private-repo.git
```

### Pip Distribution

Add an entry point in `pyproject.toml`:

```toml
[project.entry-points."hermes_agent.plugins"]
my_plugin = "my_package:register"
```

Users install via `pip install your-package`.

### Updating Plugins

```bash
# Update a single plugin
hermes plugins update my-plugin

# Update all installed plugins
hermes plugins update --all
```

---

## Example Plugins

### Example 1: Weather Query Plugin

```yaml
# plugin.yaml
name: weather-plugin
version: "1.0.0"
description: Query weather using OpenWeatherMap API
requires_env: [OPENWEATHERMAP_API_KEY]
author: Example Author
```

```python
# __init__.py
"""Weather Query Plugin for Hermes Agent."""
import os

def register(ctx):
    from .schemas import weather_schema, forecast_schema
    from .tools import get_current_weather, get_forecast

    ctx.register_tool("get_current_weather", weather_schema, get_current_weather)
    ctx.register_tool("get_weather_forecast", forecast_schema, get_forecast)
```

```python
# schemas.py
weather_schema = {
    "name": "get_current_weather",
    "description": "Get current weather for a given city",
    "parameters": {
        "type": "object",
        "properties": {
            "city": {
                "type": "string",
                "description": "City name, e.g. 'Beijing', 'New York'"
            },
            "units": {
                "type": "string",
                "enum": ["metric", "imperial"],
                "default": "metric",
                "description": "Temperature units"
            }
        },
        "required": ["city"]
    }
}

forecast_schema = {
    "name": "get_weather_forecast",
    "description": "Get weather forecast for the next few days",
    "parameters": {
        "type": "object",
        "properties": {
            "city": {
                "type": "string",
                "description": "City name"
            },
            "days": {
                "type": "integer",
                "description": "Forecast days (1-7)",
                "default": 3
            }
        },
        "required": ["city"]
    }
}
```

```python
# tools.py
"""Weather tool implementations."""
import os
import requests

API_KEY = os.environ.get("OPENWEATHERMAP_API_KEY", "")
BASE_URL = "https://api.openweathermap.org/data/2.5"

def get_current_weather(params: dict) -> str:
    city = params["city"]
    units = params.get("units", "metric")

    url = f"{BASE_URL}/weather?q={city}&appid={API_KEY}&units={units}"

    response = requests.get(url, timeout=10)

    if response.status_code != 200:
        return f"Cannot get weather: {response.json().get('message', 'unknown error')}"

    data = response.json()
    temp_unit = "°C" if units == "metric" else "°F"

    return (
        f"{city} current weather:\n"
        f"- Temperature: {data['main']['temp']}{temp_unit}\n"
        f"- Feels like: {data['main']['feels_like']}{temp_unit}\n"
        f"- Humidity: {data['main']['humidity']}%\n"
        f"- Wind speed: {data['wind'].get('speed', 0)} m/s\n"
        f"- Conditions: {data['weather'][0]['description']}\n"
        f"- Visibility: {data.get('visibility', 'N/A')} m"
    )

def get_forecast(params: dict) -> str:
    city = params["city"]
    days = min(max(params.get("days", 3), 1), 7)  # Clamp to 1-7

    url = f"{BASE_URL}/forecast?q={city}&appid={API_KEY}&units=metric&cnt={days * 8}"  # 3-hour intervals

    response = requests.get(url, timeout=10)

    if response.status_code != 200:
        return f"Cannot get forecast: {response.json().get('message', 'unknown error')}"

    data = response.json()

    result = f"{city} {days}-day forecast:\n\n"

    for item in data["list"][:days * 8]:
        dt = item["dt_txt"]
        temp = item["main"]["temp"]
        desc = item["weather"][0]["description"]
        result += f"{dt}: {temp}°C, {desc}\n"

    return result
```

### Example 2: Database Query Plugin

```python
# __init__.py
"""Database Query Plugin - safely execute SQL queries."""

import sqlite3

def register(ctx):
    db_schema = {
        "name": "query_database",
        "description": "Execute read-only SQL queries in a SQLite database",
        "parameters": {
            "type": "object",
            "properties": {
                "db_path": {
                    "type": "string",
                    "description": "Database file path"
                },
                "query": {
                    "type": "string",
                    "description": "SQL SELECT query"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max rows to return (default 100)",
                    "default": 100
                }
            },
            "required": ["db_path", "query"]
        }
    }

    def execute_query(params: dict) -> str:
        db_path = params["db_path"]
        query = params["query"].strip()
        limit = params.get("limit", 100)

        # Security check: only allow SELECT
        if not query.upper().startswith("SELECT"):
            return "Error: only SELECT queries are allowed"

        # Check for dangerous keywords
        dangerous = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "--", ";"]
        for word in dangerous:
            if word.upper() in query.upper():
                return f"Error: query contains unsafe keyword '{word}'"

        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row

            # Auto-append LIMIT
            if "LIMIT" not in query.upper():
                query += f"\nLIMIT {limit}"

            cursor = conn.execute(query)
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]

            conn.close()

            if not rows:
                return "Query returned empty result set"

            # Format as table
            header = " | ".join(columns)
            separator = "-+-".join(["-" * len(c) for c in columns])
            lines = [header, separator]

            for row in rows[:limit]:
                line = " | ".join(str(v) for v in row)
                lines.append(line)

            return "\n".join(lines)

        except sqlite3.Error as e:
            return f"SQL error: {str(e)}"
        except Exception as e:
            return f"Execution error: {str(e)}"

    ctx.register_tool("query_database", db_schema, execute_query)
```
