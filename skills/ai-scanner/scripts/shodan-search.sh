#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_jq_curl
need_cmd grep

usage() {
  cat <<'EOF'
Usage: shodan-search.sh <query> [--limit N] [--key KEY] [--cookie C] [--pages P]

Search Shodan for hosts matching a query string.
Tries API first; falls back to web scraping with cookie if API key lacks
membership or --cookie is provided.

Arguments:
  query        The Shodan search query (e.g. port:8188).

Options:
  --limit N    Max results (API: matches; web: approximate). Default 100.
  --key KEY    Shodan API key. Default: env SHODAN_API_KEY.
  --cookie C   Shodan session cookie for web scraping. Default: env SHODAN_COOKIE.
  --pages P    How many result pages to scrape (web only). Default 3.

Output:
  JSON array of {"ip":"...","port":8188} objects.
EOF
  exit 1
}

search_via_api() {
  local query="$1" limit="$2" key="$3"
  local encoded
  encoded="$(python3 -c "import urllib.parse; print(urllib.parse.quote_plus('''$query'''))")"
  local url="https://api.shodan.io/shodan/host/search?key=${key}&query=${encoded}&limit=${limit}"
  local result
  result="$(curl_json "$url" 30)"
  if jq -e '.ok' <<<"$result" >/dev/null 2>&1; then
    jq '[.body.matches[]? | {ip: .ip_str, port: .port}] | unique' <<<"$result" 2>/dev/null || echo '[]'
  else
    return 1
  fi
}

search_via_web() {
  local query="$1" pages="$2" cookie="$3"
  local all_ips=""
  for p in $(seq 1 "$pages"); do
    local page_ips
    page_ips="$(scrape_shodan_web "$query" "$p" "$cookie" || true)"
    if [[ -z "$page_ips" ]]; then break; fi
    all_ips="${all_ips}${all_ips:+$'\n'}${page_ips}"
  done
  if [[ -z "$all_ips" ]]; then echo '[]'; return 0; fi
  local port
  port="$(echo "$query" | grep -oE 'port:([0-9]+)' | cut -d: -f2 || echo "8188")"
  printf '%s\n' "$all_ips" | sort -u | while IFS= read -r ip; do
    [[ -n "$ip" ]] && printf '{"ip":"%s","port":%s}\n' "$ip" "$port"
  done | jq -s '.'
}

main() {
  local query="" limit="100" pages="3" api_key="${SHODAN_API_KEY:-}" cookie="${SHODAN_COOKIE:-}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --limit)  limit="${2?"missing --limit value"}"; shift 2 ;;
      --key)    api_key="${2?"missing --key value"}"; shift 2 ;;
      --cookie) cookie="${2?"missing --cookie value"}"; shift 2 ;;
      --pages)  pages="${2?"missing --pages value"}"; shift 2 ;;
      -h|--help) usage ;;
      -*)
        if [[ -z "$query" ]]; then die "unknown option: $1 (did you forget a query argument?)"; fi
        shift ;;
      *) query="$1"; shift ;;
    esac
  done

  [[ -n "$query" ]] || die "missing query argument"

  if [[ -n "$api_key" ]] && is_shodan_paid_key "$api_key"; then
    if search_via_api "$query" "$limit" "$api_key"; then return 0; fi
  fi

  if [[ -n "$cookie" ]]; then
    search_via_web "$query" "$pages" "$cookie"
  else
    die "no paid Shodan API key and no SHODAN_COOKIE — cannot search"
  fi
}

main "$@"
