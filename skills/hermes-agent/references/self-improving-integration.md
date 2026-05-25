# Hermes Agent Self-Improving Integration Guide

> **Version**: v1.0.0 | **Last Updated**: 2026-04-11

## Overview

This integration creates a complete **positive and negative feedback loop** between Hermes Agent and a self-improving system:

```
┌─────────────────────────────────────────────────────────────┐
│                  Self-Improving Learning Loop                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌───────────────────┐     ┌──────────────────────────┐    │
│   │   Hermes Agent     │     │  Self-Improving System   │    │
│   │                   │     │                          │    │
│   │  ✅ Success →      │     │  ❌ Failure/Correction → │    │
│   │  Extract reusable  │ ←→ │  Record error lessons    │    │
│   │  skills            │     │                          │    │
│   │                   │     │                          │    │
│   │  Storage:          │     │  Storage:                │    │
│   │  ~/.hermes/skills/ │     │  ~/.openclaw/memory/     │    │
│   └───────────────────┘     │  self-improving/         │    │
│                             └──────────────────────────┘    │
│                                                             │
│   Wrapper/Delegate scripts trigger error callbacks           │
│   automatically                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Integration Method

### Automatic Error Callback (Built-In)

Both `hermes_wrapper.sh` and `hermes_delegate.sh` include the `error_callback()` function:

**Trigger conditions**:
1. Command execution failure (non-zero exit code)
2. Task timeout (exit code 124)
3. Concurrency limit reached
4. Other runtime errors

**Callback behavior**:
- Records error info to `~/.openclaw/memory/self-improving/learnings.jsonl`
- Includes timestamp, error type, task description, original command, and context
- Reserves a `lesson` field for later analysis

### Error Record Format

```json
{
  "timestamp": "2026-04-11T20:46:00Z",
  "error_type": "TIMEOUT",
  "error_message": "Task execution timed out (300s): Research competitor products",
  "task": "Research competitor products",
  "command": "hermes run '...' --non-interactive --no-stream --timeout 300",
  "source": "hermes-delegate",
  "context": {
    "hermes_version": "Hermes Agent v0.8.0 (2026.4.8)",
    "platform": "Darwin",
    "user": "username"
  },
  "lesson": "TODO: Analyze root cause and solution for this error"
}
```

---

## Configuration & Usage

### Enable Auto-Recording (Enabled by Default)

```bash
# Error callbacks are enabled by default — no extra config needed
# Records stored at: ~/.openclaw/memory/self-improving/learnings.jsonl
```

### View Learning Records

```bash
# View all error records
cat ~/.openclaw/memory/self-improving/learnings.jsonl | jq .

# Filter by date
cat ~/.openclaw/memory/self-improving/learnings.jsonl \
  | jq 'select(.timestamp | startswith("2026-04"))'

# Count by error type
cat ~/.openclaw/memory/self-improving/learnings.jsonl \
  | jq -r '.error_type' | sort | uniq -c | sort -rn

# View most recent errors
tail -5 ~/.openclaw/memory/self-improving/learnings.jsonl | jq .
```

### Manually Add Lessons (Fill lesson Field)

After analyzing the error, update the record:

```bash
# Update a specific record's lesson field using jq
RECORD_ID=$(tail -1 learnings.jsonl | jq '.timestamp')
jq "if .timestamp == \"$RECORD_ID\" then .lesson = \"Should increase timeout to 600s or simplify task scope\" else . end" \
  learnings.jsonl > tmp.jsonl && mv tmp.jsonl learnings.jsonl
```

### Using with WorkBuddy

When the self-improving skill is loaded, it will automatically:

1. **Pre-execution check**: Read `learnings.jsonl` for historical errors
2. **Pattern matching**: Identify if current task resembles past errors
3. **Preventive suggestions**: Offer advice based on lessons learned

---

## Best Practices

### 1. Regularly Review Error Logs

Check learning records weekly:

```bash
#!/bin/bash
# review_errors.sh — Review this week's Hermes errors

ERROR_FILE="$HOME/.openclaw/memory/self-improving/learnings.jsonl"
THIS_WEEK=$(date +%Y-%W)

echo "=== Week ($THIS_WEEK) Hermes Error Report ==="
echo ""

if [ -f "$ERROR_FILE" ]; then
    # Total error count
    TOTAL=$(grep -c "" "$ERROR_FILE" 2>/dev/null || echo 0)

    # Error type distribution
    echo "📊 Error type distribution:"
    cat "$ERROR_FILE" | jq -r '.error_type' | sort | uniq -c | sort -rn | while read count type; do
        echo "   $count x $type"
    done

    echo ""
    echo "📝 Unresolved lessons (lesson is TODO):"
    cat "$ERROR_FILE" | jq -r 'select(.lesson | startswith("TODO")) | "- \(.error_type): \(.task)"'

else
    echo "✅ No error records"
fi
```

### 2. Extract Skills from Errors

When the same error type repeats 3+ times, consider converting it into a Hermes skill:

```bash
#!/bin/bash
# extract_skill_from_errors.sh — Extract skill template from errors

ERROR_FILE="$HOME/.openclaw/memory/self-improving/learnings.jsonl"
SKILLS_DIR="$HOME/.hermes/skills"

# Find the most frequent error type
TOP_ERROR=$(cat "$ERROR_FILE" | jq -r '.error_type' | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')

echo "Detected high-frequency error type: $TOP_ERROR"

case $TOP_ERROR in
    TIMEOUT)
        SKILL_NAME="timeout-handling"
        echo "Suggested creating skill: $SKILL_NAME"

        mkdir -p "$SKILLS_DIR/$SKILL_NAME"
        cat > "$SKILLS_DIR/$SKILL_NAME/skill.md" << EOF
---
name: timeout-handling
description: Handle long-running tasks that might timeout
triggers:
  - timeout task
  - large data queries
  - complex research
---

# Timeout Handling Skill

## Strategy
1. **Break down tasks**: Split large tasks into smaller steps
2. **Set reasonable timeouts**: simple 60s, medium 300s, complex 600s+
3. **Restrict toolsets**: Only enable necessary tools to reduce token consumption
4. **Save incrementally**: Save intermediate results after each step
5. **Retry mechanism**: Auto-retry once on failure

## Best Practices
\`\`\`bash
# Recommended parameters
hermes run "task" --toolset web_search --timeout 120
\`\`\`
EOF

        echo "✅ Skill created: $SKILLS_DIR/$SKILL_NAME/skill.md"
        ;;
esac
```

### 3. Bidirectional Sync

Let Hermes' skill system and the error system learn from each other:

```python
# Optional advanced integration code
def sync_hermes_with_self_improving():
    """
    Periodically sync Hermes skills and self-improving records
    """
    import json

    skills_dir = Path("~/.hermes/skills").expanduser()
    errors_file = Path("~/.openclaw/memory/self-improving/learnings.jsonl").expanduser()

    # 1. Notify self-improving about new skills
    for skill_file in skills_dir.glob("**/skill.md"):
        skill_name = skill_file.parent.name
        # Mark as capability learned from success
        log_success(f"New skill available: {skill_name}")

    # 2. Analyze error patterns and suggest skill improvements
    if errors_file.exists():
        with open(errors_file) as f:
            errors = [json.loads(line) for line in f]

        # Group by error type
        from collections import Counter
        error_types = Counter(e['error_type'] for e in errors)

        for error_type, count in error_types.most_common(3):
            if count >= 3 and not any(s.name == f"{error_type}-handling"
                                       for s in list_skills()):
                suggest_skill_creation(error_type, errors)
```

---

## Troubleshooting

### Q: Error record file doesn't exist?

```bash
mkdir -p ~/.openclaw/memory/self-improving/
touch ~/.openclaw/memory/self-improving/learnings.jsonl
```

### Q: jq command not available?

```bash
# macOS install jq
brew install jq

# Or use Python instead
python3 -c "
import json
with open('learnings.jsonl') as f:
    for line in f:
        print(json.dumps(json.loads(line), indent=2))
"
```

### Q: How to disable error callbacks?

Temporarily disable:
```bash
HERMES_DISABLE_SELF_IMPROVING=true hermes_wrapper.sh run "prompt"
```

To permanently disable, remove the `error_callback()` calls in the scripts.

---

## Summary

| Dimension | Hermes Agent | Self-Improving System |
|-----------|-------------|----------------------|
| **Learning source** | ✅ Successful tasks | ❌ Failures/corrections |
| **Storage format** | Markdown skill files | JSONL record files |
| **Trigger** | After task completion | User correction / failure |
| **Optimization frequency** | Every ~15 tasks | Before every execution |
| **Content type** | Reusable methodology | Mistakes to avoid |

The two systems complement each other, forming a **complete positive and negative feedback loop** that makes the agent smarter the more you use it.
