#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_jq_curl

CACHE_DIR="${AI_SCANNER_CACHE_DIR:-$SCRIPT_DIR/../.cache}"
CACHE_FILE="${CACHE_DIR}/ips.jsonl"

# ---- Target definitions (macOS bash 3.2 compatible) ----
TARGET_NAMES="comfyui ollama gradio jupyter localai kobold ssh-gpu"

get_target_port() {
  case "$1" in
    comfyui) echo 8188 ;; ollama) echo 11434 ;; gradio) echo 7860 ;;
    jupyter) echo 8888 ;; localai) echo 4891 ;; kobold) echo 5001 ;;
    ssh-gpu) echo 22   ;; *) echo "" ;;
  esac
}

get_target_query() {
  case "$1" in
    comfyui) echo 'port:8188 html:"ComfyUI"' ;;
    ollama)  echo 'port:11434 html:"Ollama"' ;;
    gradio)  echo 'port:7860' ;;
    jupyter) echo 'port:8888 html:"Jupyter"' ;;
    localai) echo 'port:4891' ;;
    kobold)  echo 'port:5001' ;;
    ssh-gpu) echo 'port:22 html:"NVIDIA" -html:"SSH-2.0"' ;;
    *) echo "" ;;
  esac
}

get_target_priority() {
  case "$1" in
    comfyui|ollama)  echo 1 ;;
    gradio|jupyter)  echo 2 ;;
    localai|kobold|ssh-gpu) echo 3 ;;
    *) echo 9 ;;
  esac
}

usage() {
  cat <<'EOF'
Usage: cache-ips.sh [OPTIONS]

Accumulate IPs from Shodan into a persistent cache. Runs daily to grow your
IP database. Only new IPs are appended.

Options:
  --shodan-cookie C  Shodan session cookie (env SHODAN_COOKIE).
  --pages N          Pages to scrape per query (default: 2).
  --targets T        Comma-separated targets (default: comfyui,ollama).
                     Named groups: "all", "ai", or individual: comfyui,ollama,
                     gradio,jupyter,localai,kobold,ssh-gpu.
  --priority N       Only scan targets with priority <= N (1=high, 3=low).
                     Default: scan all in --targets.
  --list             Just list cached IPs without fetching new ones.
  --clear            Clear the cache before fetching.
  --help             Show this message.

Examples:
  cache-ips.sh --pages 2                                    # comfyui + ollama
  cache-ips.sh --targets all --pages 2                      # everything
  cache-ips.sh --targets ai --priority 1 --pages 2          # high-priority AI
  cache-ips.sh --targets jupyter,ssh-gpu --pages 1          # just infra
EOF
  exit 1
}

_ensure_cache_file() {
  mkdir -p "$CACHE_DIR"
  touch "$CACHE_FILE"
}

_list_cached() {
  _ensure_cache_file
  if [[ -s "$CACHE_FILE" ]]; then
    jq -s '.' "$CACHE_FILE"
  else
    echo '[]'
  fi
}

_upsert_entries() {
  local new_entries="$1"
  [[ "$(echo "$new_entries" | jq 'length')" -eq 0 ]] && return

  if [[ ! -s "$CACHE_FILE" ]]; then
    printf '%s\n' "$new_entries" | jq -c '.[]' >>"$CACHE_FILE"
    return
  fi

  local cached
  cached="$(jq -s '.' "$CACHE_FILE")"

  local merged
  merged="$(jq -s 'add | unique_by({ip, port})' \
    <(printf '%s\n' "$cached") \
    <(printf '%s\n' "$new_entries"))"

  printf '%s\n' "$merged" | jq -c '.[]' >"$CACHE_FILE"
}

main() {
  local shodan_cookie="${SHODAN_COOKIE:-}" pages="2"
  local targets_str="" priority_filter="" list_only="false" clear_cache="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --shodan-cookie) shodan_cookie="$2";    shift 2 ;;
      --pages)         pages="$2";            shift 2 ;;
      --targets)       targets_str="$2";      shift 2 ;;
      --priority)      priority_filter="$2";  shift 2 ;;
      --list)          list_only="true";      shift ;;
      --clear)         clear_cache="true";    shift ;;
      --help)          usage ;;
      *) die "unknown option: $1" ;;
    esac
  done

  _ensure_cache_file

  if [[ "$clear_cache" == "true" ]]; then
    >"$CACHE_FILE"
  fi

  if [[ "$list_only" == "true" ]]; then
    _list_cached
    return
  fi

  # Resolve targets
  local targets
  case "${targets_str:-default}" in
    ""|default) targets="$DEFAULT_TARGETS" ;;
    all)        targets="$ALL_TARGETS" ;;
    ai)         targets="$AI_TARGETS" ;;
    *)          targets="${targets_str//,/ }" ;;
  esac

  local cached ts total_seen=0 total_added=0
  cached="$(_list_cached)"
  ts="$(now_iso)"

  for name in $targets; do
    local port query priority
    port="$(get_target_port "$name")"
    query="$(get_target_query "$name")"
    priority="$(get_target_priority "$name")"
    [[ -z "$port" ]] && { echo "[!] Unknown target: $name. Valid: $ALL_TARGETS" >&2; continue; }

    # Priority filter
    if [[ -n "$priority_filter" && "$priority" -gt "$priority_filter" ]]; then
      printf '[%s] [%s] Skipped (priority %s > %s)\n' "$ts" "$name" "$priority" "$priority_filter" >&2
      continue
    fi

    printf '[%s] [%s] port %s (priority %s)\n' "$ts" "$name" "$port" "$priority" >&2

    local raw
    raw="$("$SCRIPT_DIR/shodan-search.sh" "$query" --cookie "$shodan_cookie" --pages "$pages" 2>/dev/null || echo '[]')"

    local new_count
    new_count="$(jq 'length' <<<"$raw")"
    printf '[%s] [%s] Scraped %s candidates\n' "$ts" "$name" "$new_count" >&2

    # Only keep entries not already cached
    local fresh
    fresh="$(jq --argjson cache "$cached" --arg name "$name" --arg port "$port" --arg ts "$ts" '
      [.[] | select(.ip as $ip | $cache | map(select(.ip == $ip and .port == ($port | tonumber))) | length == 0) |
       {ip, port: ($port | tonumber), service: $name, first_seen: $ts}]
    ' <<<"$raw")"

    local added
    added="$(jq 'length' <<<"$fresh")"

    if [[ "$added" -gt 0 ]]; then
      _upsert_entries "$fresh"
      cached="$(_list_cached)"
    fi

    total_seen=$((total_seen + new_count))
    total_added=$((total_added + added))
    printf '[%s] [%s] %s new IPs added\n' "$ts" "$name" "$added" >&2
  done

  local total
  total="$(wc -l <"$CACHE_FILE" | tr -d ' ')"
  printf '[%s] Done: %s seen, %s new, %s total cached\n' "$ts" "$total_seen" "$total_added" "$total" >&2
  _list_cached
}

main "$@"
