#!/usr/bin/env bash
set -euo pipefail

AI_SCANNER_VERSION="0.1.0"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

default_results_dir() {
  printf '%s\n' "${AI_SCANNER_RESULTS_DIR:-$PWD/results}"
}

ensure_results_dir() {
  local dir="${1:-$(default_results_dir)}"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

normalize_base_url() {
  local input="$1"
  local default_port="${2:-}"

  if [[ "$input" =~ ^https?:// ]]; then
    printf '%s\n' "${input%/}"
    return
  fi

  if [[ "$input" == *:* || -z "$default_port" ]]; then
    printf 'http://%s\n' "$input"
  else
    printf 'http://%s:%s\n' "$input" "$default_port"
  fi
}

curl_json() {
  local url="$1"
  local timeout="${2:-6}"
  local tmp_body tmp_err _code content_type

  tmp_body="$(mktemp)" || return 0
  tmp_err="$(mktemp)"  || return 0

  set +e
  _code="$(curl -sS -L \
    --max-time "$timeout" \
    --connect-timeout "$timeout" \
    -H 'Accept: application/json' \
    -w '%{http_code} %{content_type}' \
    -o "$tmp_body" \
    "$url" 2>"$tmp_err")" || true
  set -e

  content_type="${_code#* }"
  _code="${_code%% *}"

  local ok=false
  [[ "$_code" =~ ^2[0-9][0-9]$ ]] && ok=true

  jq -n \
    --arg url "$url" \
    --arg code "$_code" \
    --arg ok "$ok" \
    --arg ct "$content_type" \
    --slurpfile body "$tmp_body" \
    '{
      url: $url,
      ok: ($ok == "true"),
      status: ($code | tonumber? // 0),
      content_type: $ct,
      body: (try ($body[0] | fromjson) catch ($body[0] // null)),
      error: null
    }'

  rm -f "$tmp_body" "$tmp_err"
}

write_jsonl() {
  local file="$1"
  local json="$2"
  printf '%s\n' "$json" >>"$file"
}

require_jq_curl() {
  need_cmd jq
  need_cmd curl
}

scrape_shodan_web() {
  local query="$1" page="${2:-1}" cookie="${3:-}"
  [[ -n "$cookie" ]] || die "SHODAN_COOKIE required for web scraping (pass --cookie or export env)"

  # Accept both "polito=<hash>!" and bare "<hash>!"
  [[ "$cookie" != polito=* ]] && cookie="polito=$cookie"

  local encoded
  encoded="$(python3 -c "import urllib.parse; print(urllib.parse.quote_plus('''$query'''))")"

  local url="https://www.shodan.io/search?query=${encoded}&page=${page}"

  curl -sS -L --max-time 20 --connect-timeout 10 \
    -H "Cookie: $cookie" \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
    -H "Accept: text/html,application/xhtml+xml" \
    "$url" 2>/dev/null | \
    grep -oE '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' | sort -u || true
}

is_shodan_paid_key() {
  local key="${1:-}"
  [[ -z "$key" ]] && return 1
  local check
  check="$(curl -sS --max-time 10 "https://api.shodan.io/api-info?key=${key}" 2>/dev/null || true)"
  local plan membership
  plan="$(jq -r '.plan // "free"' <<<"$check" 2>/dev/null || echo "free")"
  membership="$(jq -r '.membership // false' <<<"$check" 2>/dev/null || echo "false")"
  if [[ "$plan" != "free" || "$membership" == "true" ]]; then return 0; else return 1; fi
}

check_shodan_cookie() {
  local cookie="${1:-}"
  [[ -z "$cookie" ]] && { printf '[!] SHODAN_COOKIE not set — web scraping will fail\n' >&2; return 1; }
  # Quick test: try fetching page 1 of a known query
  [[ "$cookie" != polito=* ]] && cookie="polito=$cookie"
  local result
  result="$(curl -sS -L --max-time 15 --connect-timeout 10 \
    -H "Cookie: ${cookie}" \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    -H "Accept: text/html" \
    "https://www.shodan.io/search?query=port:80&page=1" 2>/dev/null || true)"
  if echo "$result" | grep -q 'login-form\|cf-browser-verification\|Cloudflare'; then
    printf '[!] Shodan cookie may be expired or blocked (login/captcha detected)\n' >&2
    printf '[!] Renew from browser: DevTools → Application → Cookies → polito\n' >&2
    return 1
  elif echo "$result" | grep -qoE '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' >/dev/null; then
    printf '[✓] Shodan cookie valid\n' >&2
    return 0
  else
    printf '[!] Shodan cookie status unclear (no IPs found in test page)\n' >&2
    return 2
  fi
}
