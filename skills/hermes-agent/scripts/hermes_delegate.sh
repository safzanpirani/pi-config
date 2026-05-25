#!/bin/bash
# ============================================================================
# Hermes Agent Delegate Script for Pi (v2.1 — Hermes v0.12+ CLI)
# ============================================================================
# Dedicated sub-agent delegation script for Hermes v0.12+.
# Uses `hermes chat -q "prompt" -Q` for non-interactive execution.
#
# Usage:
#   ./hermes_delegate.sh --task "task description" [options]
#
# Examples:
#   ./hermes_delegate.sh --task "Analyze product differences" --tools web,terminal
#   ./hermes_delegate.sh -t "Write tests" --tools code_execution --output result.md
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration (dynamic detection)
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_CMD="${HERMES_CMD:-hermes}"
if ! command -v "$HERMES_CMD" &> /dev/null; then
    for candidate in \
        "$HOME/.local/bin/hermes" \
        "$HOME/.local/hermes-agent/.venv/bin/hermes" \
        "/usr/local/bin/hermes" \
        "$(which hermes 2>/dev/null)"; do
        if [ -x "$candidate" ]; then
            HERMES_CMD="$candidate"
            break
        fi
    done
fi
DEFAULT_TIMEOUT=300
MAX_CONCURRENT_DELEGATES=3

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[DELEGATE]${NC} $(date '+%H:%M:%S') $*" >&2; }
log_success() { echo -e "${GREEN}[DELEGATE]${NC} $*" >&2; }
log_error()   { echo -e "${RED}[DELEGATE]${NC} $*" >&2; }
log_warn()    { echo -e "${YELLOW}[DELEGATE]${NC} $*" >&2; }
log_debug()   { [[ "${DEBUG:-false}" == "true" ]] && echo -e "${MAGENTA}[DEBUG]${NC} $*" >&2 || true; }

# ============================================================================
# Utilities
# ============================================================================

check_dependencies() {
    if ! command -v "$HERMES_CMD" &> /dev/null; then
        log_error "Hermes command not found: $HERMES_CMD"
        return 1
    fi
    return 0
}

generate_task_id() {
    echo "delegate_$(date '+%Y%m%d_%H%M%S')_$$_${RANDOM}"
}

build_delegate_prompt() {
    local task="$1"
    local tools="${2:-}"

    cat << 'PROMPT'
You are a professional sub-agent. Complete the following task thoroughly.
Return the complete result with key findings, data, or conclusions.
If errors occur, describe them in detail.
Use Markdown to organize output.

PROMPT
    echo ""
    echo "## Task"
    echo ""
    echo "$task"
    echo ""

    if [ -n "$tools" ]; then
        echo "## Available Tools"
        echo "You have access to these tools: $tools"
        echo ""
    fi
}

format_json_result() {
    local success="$1"
    local output="$2"
    local error="$3"
    local duration_ms="$4"
    local task_id="$5"
    local output_path="${6:-}"

    local safe_output
    safe_output=$(echo "$output" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"$(echo "$output" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')\"")
    local safe_error
    safe_error=$(echo "$error" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"$(echo "$error" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')\"")

    cat << EOF
{
  "success": $success,
  "task_id": "$task_id",
  "output": $safe_output,
  "error": $safe_error,
  "duration_ms": ${duration_ms:-0},
  "output_file": $(echo "${output_path:-}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""'),
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
}

# ============================================================================
# Main Execution
# ============================================================================
execute_delegate() {
    local task="$1"
    local tools="$2"
    local timeout_sec="$3"
    local output_file="$4"
    local model="$5"
    local skills="$6"

    local task_id
    task_id=$(generate_task_id)

    log_info "========== Delegated Task =========="
    log_info "Task ID: $task_id"
    log_info "Task: $(echo "$task" | head -c 120)..."
    [ -n "$tools" ] && log_info "Tools: $tools"
    [ -n "$model" ] && log_info "Model: $model"
    log_info "Timeout: ${timeout_sec}s"
    log_info "===================================="

    # Build prompt
    local prompt
    prompt=$(build_delegate_prompt "$task" "$tools")

    # Build command
    local cmd="$HERMES_CMD chat -q \"$prompt\" -Q --max-turns 50"
    [ -n "$tools" ] && cmd="$cmd -t \"$tools\""
    [ -n "$model" ] && cmd="$cmd -m \"$model\""
    [ -n "$skills" ] && cmd="$cmd -s \"$skills\""

    log_debug "Command: $cmd"

    # Execute
    local start_time=$(date +%s%N 2>/dev/null || date +%s)
    local raw_output=""
    local exit_code=0

    if command -v timeout &> /dev/null; then
        raw_output=$(timeout "$timeout_sec" bash -c "$cmd" 2>&1) || exit_code=$?
    else
        raw_output=$(bash -c "$cmd" 2>&1) || exit_code=$?
    fi

    local end_time=$(date +%s%N 2>/dev/null || date +%s)
    local duration_ms=0
    if [[ "$start_time" =~ ^[0-9]+$ ]] && [[ "$end_time" =~ ^[0-9]+$ ]]; then
        if [ ${#start_time} -gt 10 ]; then
            duration_ms=$(( (end_time - start_time) / 1000000 ))
        else
            duration_ms=$(( (end_time - start_time) * 1000 ))
        fi
    fi

    # Save output if requested
    if [ -n "$output_file" ]; then
        mkdir -p "$(dirname "$output_file")" 2>/dev/null || true
        echo "$raw_output" > "$output_file"
        log_success "Output saved: $output_file"
    fi

    # Report result
    case $exit_code in
        0)
            log_success "Task completed (${duration_ms}ms)"
            format_json_result true "$raw_output" "" "$duration_ms" "$task_id" "$output_file"
            ;;
        124)
            log_error "Task timed out (${timeout_sec}s)"
            format_json_result false "$raw_output" "Task timed out after ${timeout_sec}s" "$duration_ms" "$task_id" "$output_file"
            ;;
        *)
            log_error "Task failed (exit $exit_code)"
            # Check for usage error
            if echo "$raw_output" | grep -qi "usage:"; then
                local err_line
                err_line=$(echo "$raw_output" | grep -i "error:" | head -1)
                format_json_result false "$raw_output" "CLI error: ${err_line:-syntax}" "$duration_ms" "$task_id" "$output_file"
            else
                format_json_result false "$raw_output" "Execution failed (exit $exit_code)" "$duration_ms" "$task_id" "$output_file"
            fi
            ;;
    esac

    return $exit_code
}

# ============================================================================
# Argument Parsing
# ============================================================================
show_help() {
    cat << 'EOF'
Hermes Agent Delegate Script v2.1 (Hermes v0.12+)
==================================================

Usage:
  hermes_delegate.sh --task "task description" [options]

Required:
  --task, -t       Task description

Options:
  --tools            Restricted toolsets (comma-separated)
  --timeout          Timeout in seconds (default: 300)
  --output, -o       Output file path
  --model, -m        Model override
  --skills, -s       Skills to preload (comma-separated)
  --dry-run          Show command without executing
  -h, --help         Show help

Examples:
  hermes_delegate.sh --task "Research React vs Vue" --tools web,terminal
  hermes_delegate.sh -t "Write unit tests" --tools code_execution --output result.md
  hermes_delegate.sh -t "Review code" --model gpt-5.5 --timeout 120

Output: JSON (success, task_id, output, error, duration_ms, output_file)
EOF
}

main() {
    local task=""
    local tools=""
    local timeout=$DEFAULT_TIMEOUT
    local output_file=""
    local model=""
    local skills=""
    local dry_run=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --task|-t) shift; task="$1" ;;
            --tools|--toolset) shift; tools="$1" ;;
            --timeout) shift; timeout="$1" ;;
            --output|-o) shift; output_file="$1" ;;
            --model|-m) shift; model="$1" ;;
            --skills|-s) shift; skills="$1" ;;
            --max-concurrent|--context-file|-c|-v|--verbose) shift ;;
            --dry-run) dry_run=true ;;
            -h|--help) show_help; exit 0 ;;
            *) if [ -z "$task" ]; then task="$1"; fi ;;
        esac
        shift
    done

    if [ -z "$task" ]; then
        log_error "Missing required --task parameter"
        show_help
        exit 1
    fi

    if [ "$dry_run" = true ]; then
        log_info "[DRY RUN] Task: $task"
        log_info "  Tools: ${tools:-none}, Timeout: ${timeout}s, Model: ${model:-default}"
        exit 0
    fi

    check_dependencies || exit 1
    execute_delegate "$task" "$tools" "$timeout" "$output_file" "$model" "$skills"
}

main "$@"
