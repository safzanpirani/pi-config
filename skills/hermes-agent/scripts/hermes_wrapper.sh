#!/bin/bash
# ============================================================================
# Hermes Agent Wrapper Script for Pi (v2.1 — Hermes v0.12+ CLI)
# ============================================================================
# Unified CLI wrapper providing formatted JSON output, error handling,
# and timeout protection. Auto-detects Hermes version and adapts.
#
# Usage:
#   ./hermes_wrapper.sh [command] [args...]
#
# Examples:
#   ./hermes_wrapper.sh run "Analyze this URL content" --timeout 60
#   ./hermes_wrapper.sh memory status
#   ./hermes_wrapper.sh status
#
# Output format: JSON (success, output, error, duration, command)
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration (dynamic detection, no hardcoded paths)
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_CMD="${HERMES_CMD:-hermes}"
# Search for hermes install location by priority
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

# Colors (for terminal output)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# Utility Functions
# ============================================================================

log_info()    { echo -e "${BLUE}[INFO]${NC} $*" >&2; }
log_success() { echo -e "${GREEN}[OK]${NC} $*" >&2; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*" >&2; }

# Check if Hermes is installed
check_hermes() {
    if ! command -v "$HERMES_CMD" &> /dev/null; then
        log_error "Hermes Agent not found."
        log_error "Run the install script: bash scripts/install_hermes.sh"
        return 1
    fi
    return 0
}

# JSON output helper
json_output() {
    local success="$1"
    local output="$2"
    local error="$3"
    local duration="${4:-0}"
    local command="${5:-}"

    # Escape for JSON
    local safe_output
    safe_output=$(echo "$output" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"$(echo "$output" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')\"")
    local safe_error
    safe_error=$(echo "$error" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"$(echo "$error" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')\"")
    local safe_command
    safe_command=$(echo "${command:-}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()[:200]))" 2>/dev/null || echo "\"$(echo "${command:-}" | head -c 200 | sed 's/\\/\\\\/g; s/"/\\"/g')\"")

    cat << EOF
{
  "success": $success,
  "output": $safe_output,
  "error": $safe_error,
  "duration_ms": ${duration:-0},
  "command": $safe_command
}
EOF
}

# ============================================================================
# Command Handlers
# ============================================================================

# Handle 'run' command (single-turn execution)
# Hermes v0.12+: uses `hermes -z "prompt"` or `hermes chat -q "prompt" -Q`
handle_run() {
    local prompt=""
    local timeout=$DEFAULT_TIMEOUT
    local toolset=""
    local model=""
    local skills=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --timeout) shift; timeout="${1:-$DEFAULT_TIMEOUT}" ;;
            --toolset|-t) shift; toolset="$1" ;;
            --model|-m) shift; model="$1" ;;
            --skills|-s) shift; skills="$1" ;;
            --context-file|-c) shift; log_warn "--context-file not supported in v0.12+, appending content inline"; prompt="$prompt\n\nContext from $(basename "$1"):\n$(cat "$1" 2>/dev/null || echo '(could not read)')" ;;
            --no-stream|--non-interactive) ;; # No-ops for v0.12+
            -*|*) prompt="$prompt $1" ;;
        esac
        shift
    done

    prompt=$(echo "$prompt" | sed 's/^[[:space:]]*//')

    if [ -z "$prompt" ]; then
        json_output false "" "Missing required prompt argument. Usage: hermes_wrapper.sh run \"your prompt\"" 0 "run"
        return 1
    fi

    log_info "Running: $prompt"
    log_info "Timeout: ${timeout}s, Tools: ${toolset:-default}"

    # Build command — use chat -q for tool/model control, fall back to -z for simple queries
    local cmd
    if [ -n "$toolset" ] || [ -n "$model" ] || [ -n "$skills" ]; then
        cmd="$HERMES_CMD chat -q \"$prompt\" -Q"
        [ -n "$toolset" ] && cmd="$cmd -t \"$toolset\""
        [ -n "$model" ] && cmd="$cmd -m \"$model\""
        [ -n "$skills" ] && cmd="$cmd -s \"$skills\""
        cmd="$cmd --max-turns 50"
    else
        cmd="$HERMES_CMD -z \"$prompt\""
    fi

    # Execute with timeout
    local start_time=$(date +%s%N 2>/dev/null || date +%s)
    local result
    result=$(timeout "$timeout" bash -c "$cmd" 2>&1) || true
    local exit_code=${PIPESTATUS[0]:-$?}
    local end_time=$(date +%s%N 2>/dev/null || date +%s)

    # Calculate duration in ms
    local duration_ms=0
    if [[ "$start_time" =~ ^[0-9]+$ ]] && [[ "$end_time" =~ ^[0-9]+$ ]]; then
        if [ ${#start_time} -gt 10 ]; then
            duration_ms=$(( (end_time - start_time) / 1000000 ))
        else
            duration_ms=$(( (end_time - start_time) * 1000 ))
        fi
    fi

    # Handle exit codes
    if echo "$result" | grep -qi "usage:"; then
        # Hermes printed usage — command syntax error
        local err_line
        err_line=$(echo "$result" | grep "error:" | head -1)
        json_output false "$result" "Command syntax error: ${err_line:-unknown}" "$duration_ms" "$cmd"
    elif [ $exit_code -eq 124 ] || echo "$result" | grep -q "timed out"; then
        json_output false "$result" "Command timed out (${timeout}s)" "$duration_ms" "$cmd"
    elif [ $exit_code -ne 0 ]; then
        json_output false "$result" "Command failed, exit code: $exit_code" "$duration_ms" "$cmd"
    else
        json_output true "$result" "" "$duration_ms" "$cmd"
    fi
}

# Handle 'memory' command
handle_memory() {
    local subcmd="${1:-status}"
    shift 2>/dev/null || true

    case "$subcmd" in
        status) run_hermes_raw "$HERMES_CMD memory status" ;;
        setup)  run_hermes_raw "$HERMES_CMD memory setup" ;;
        off)    run_hermes_raw "$HERMES_CMD memory off" ;;
        reset)  run_hermes_raw "$HERMES_CMD memory reset" ;;
        search|list|notes|add|export|import)
            json_output false "" "Memory '$subcmd' not available in Hermes v0.12+. Memory is now external-provider-based. Use 'memory status' to see current config, or 'memory setup' to configure a provider (honcho, mem0, etc.)." 0 "memory $subcmd"
            ;;
        *)
            json_output false "" "Unknown memory subcommand: $subcmd. Available: status, setup, off, reset" 0 "memory"
            ;;
    esac
}

# Handle 'skills' command
handle_skills() {
    local subcmd="${1:-list}"
    shift 2>/dev/null || true

    case "$subcmd" in
        list|ls)    run_hermes_raw "$HERMES_CMD skills list" ;;
        browse)     run_hermes_raw "$HERMES_CMD skills browse" ;;
        search)     run_hermes_raw "$HERMES_CMD skills search $*" ;;
        install)    run_hermes_raw "$HERMES_CMD skills install $*" ;;
        inspect)    run_hermes_raw "$HERMES_CMD skills inspect $*" ;;
        check)      run_hermes_raw "$HERMES_CMD skills check" ;;
        update)     run_hermes_raw "$HERMES_CMD skills update" ;;
        uninstall)  run_hermes_raw "$HERMES_CMD skills uninstall $*" ;;
        audit)      run_hermes_raw "$HERMES_CMD skills audit" ;;
        *)
            json_output false "" "Unknown skills subcommand: $subcmd. Available: list, browse, search, install, inspect, check, update, uninstall, audit" 0 "skills"
            ;;
    esac
}

# Handle 'plugins' command
handle_plugins() {
    local subcmd="${1:-list}"
    shift 2>/dev/null || true
    run_hermes_raw "$HERMES_CMD plugins $subcmd $*"
}

# Handle 'cron' command
handle_cron() {
    local subcmd="${1:-list}"
    shift 2>/dev/null || true
    run_hermes_raw "$HERMES_CMD cron $subcmd $*"
}

# Handle 'delegate' command (delegate to sub-agent via hermes chat -q)
handle_delegate() {
    local task=""
    local tools=""
    local timeout=300
    local output_file=""
    local model=""
    local skills=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --task|-t) shift; task="$1" ;;
            --tools|--toolset) shift; tools="$1" ;;
            --timeout) shift; timeout="$1" ;;
            --output|-o) shift; output_file="$1" ;;
            --model|-m) shift; model="$1" ;;
            --skills|-s) shift; skills="$1" ;;
            --max-concurrent|--context-file|-c|-v|--verbose) shift ;; # Accept but ignore
            *) if [ -z "$task" ]; then task="$1"; fi ;;
        esac
        shift
    done

    if [ -z "$task" ]; then
        json_output false "" "Missing required task description. Usage: hermes_wrapper.sh delegate --task 'task description'" 0 "delegate"
        return 1
    fi

    log_info "Delegating task: $task"

    local delegate_prompt="You are a sub-agent. Complete the following task thoroughly and return the full result.\n\n## Task\n\n$task\n\n## Instructions\n- Execute directly and return the complete result\n- Include key findings, data, or conclusions\n- If errors occur, describe them in detail"

    local cmd="$HERMES_CMD chat -q \"$delegate_prompt\" -Q --max-turns 50"
    [ -n "$tools" ] && cmd="$cmd -t \"$tools\""
    [ -n "$model" ] && cmd="$cmd -m \"$model\""
    [ -n "$skills" ] && cmd="$cmd -s \"$skills\""

    local start_time=$(date +%s%N 2>/dev/null || date +%s)
    local result
    result=$(timeout "$timeout" bash -c "$cmd" 2>&1) || true
    local exit_code=${PIPESTATUS[0]:-$?}
    local end_time=$(date +%s%N 2>/dev/null || date +%s)

    local duration_ms=0
    if [[ "$start_time" =~ ^[0-9]+$ ]] && [[ "$end_time" =~ ^[0-9]+$ ]]; then
        if [ ${#start_time} -gt 10 ]; then
            duration_ms=$(( (end_time - start_time) / 1000000 ))
        else
            duration_ms=$(( (end_time - start_time) * 1000 ))
        fi
    fi

    # Write to output file if specified
    if [ -n "$output_file" ]; then
        mkdir -p "$(dirname "$output_file")" 2>/dev/null || true
        echo "$result" > "$output_file"
    fi

    if [ $exit_code -eq 124 ]; then
        json_output false "$result" "Delegated task timed out (${timeout}s)" "$duration_ms" "delegate"
    elif [ $exit_code -ne 0 ]; then
        json_output false "$result" "Delegated task failed, exit code: $exit_code" "$duration_ms" "delegate"
    else
        json_output true "$result" "" "$duration_ms" "delegate"
    fi
}

# Handle 'status' and 'doctor' commands
handle_status() {
    log_info "Checking Hermes status..."
    run_hermes_raw "$HERMES_CMD status"
}

# Low-level executor that returns JSON
run_hermes_raw() {
    local cmd="$1"
    local start_time=$(date +%s%N 2>/dev/null || date +%s)
    local result
    result=$(bash -c "$cmd" 2>&1) || true
    local exit_code=${PIPESTATUS[0]:-$?}
    local end_time=$(date +%s%N 2>/dev/null || date +%s)

    local duration_ms=0
    if [[ "$start_time" =~ ^[0-9]+$ ]] && [[ "$end_time" =~ ^[0-9]+$ ]]; then
        if [ ${#start_time} -gt 10 ]; then
            duration_ms=$(( (end_time - start_time) / 1000000 ))
        else
            duration_ms=$(( (end_time - start_time) * 1000 ))
        fi
    fi

    if [ $exit_code -ne 0 ]; then
        json_output false "$result" "Command failed (exit $exit_code)" "$duration_ms" "$cmd"
    else
        json_output true "$result" "" "$duration_ms" "$cmd"
    fi
}

# Show help
show_help() {
    cat << 'EOF'
Hermes Agent Wrapper Script v2.1 (Hermes v0.12+)
=================================================

Usage:
  hermes_wrapper.sh [options]

Commands:
  run        Single-turn execution (recommended for agent integration)
  delegate   Delegate task to sub-agent
  memory     Memory management (status, setup, off, reset)
  skills     Skill management (list, browse, search, install, etc.)
  plugins    Plugin management
  cron       Cron job management
  status     Check Hermes status
  doctor     Run diagnostics
  help       Show this help

Examples:
  hermes_wrapper.sh run "Analyze this web page" --timeout 60
  hermes_wrapper.sh run "Research X" --toolset web,terminal --model gpt-5.5
  hermes_wrapper.sh delegate --task "Research competitor products" --tools web
  hermes_wrapper.sh skills list
  hermes_wrapper.sh status

Output format: JSON (fields: success, output, error, duration_ms, command)
EOF
}

# ============================================================================
# Main
# ============================================================================

main() {
    local command="${1:-help}"
    shift 2>/dev/null || true

    # Check if Hermes is needed (help and version don't require it)
    if [[ ! "$command" =~ ^(help|--help|-h|version|--version)$ ]]; then
        check_hermes || exit 1
    fi

    case "$command" in
        run|r)           handle_run "$@" ;;
        delegate|d)      handle_delegate "$@" ;;
        memory|m)        handle_memory "$@" ;;
        skills|skill|s)  handle_skills "$@" ;;
        plugins|p)       handle_plugins "$@" ;;
        cron|c)          handle_cron "$@" ;;
        status|st)       handle_status ;;
        doctor|diag)     run_hermes_raw "$HERMES_CMD doctor" ;;
        help|--help|-h)  show_help ;;
        version|--version|-v) run_hermes_raw "$HERMES_CMD --version" ;;
        *)
            json_output false "" "Unknown command: $command. Run 'hermes_wrapper.sh help' for usage." 0 "$command"
            exit 1
            ;;
    esac
}

main "$@"
