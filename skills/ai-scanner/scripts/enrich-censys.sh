#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_jq_curl

usage() {
  cat <<'EOF'
Usage: enrich-censys.sh --ip IP [OPTIONS]

Look up a single IP on Censys (free tier: host lookup only, no search).
Enriches cached IP data with:
- Open ports & services
- OS/software banners
- ASN/location/cloud provider

Options:
  --ip IP          IP to look up (required).
  --censys-id ID   Censys API ID (env CENSYS_API_ID).
  --censys-secret S Censys API secret (env CENSYS_API_SECRET).
  --ips-file FILE  Read IPs from a file (one per line), enrich all.
  --cache-dir DIR  Cache directory (default: ../.cache).
  --json           Output full Censys response.
  --help           Show this message.

Auth:
  Free Censys account (https://search.censys.io/account/api):
  export CENSYS_API_ID="xxx" CENSYS_API_SECRET="xxx"

Note: Free tier allows host lookup ONLY (not search).
EOF
  exit 1
}

censys_lookup() {
  local ip="$1" api_id="$2" api_secret="$3" timeout="${4:-15}"

  local url="https://search.censys.io/api/v2/hosts/${ip}"

  local result
  result="$(curl -sS --max-time "$timeout" --connect-timeout "$timeout" \
    -u "${api_id}:${api_secret}" \
    -H "Accept: application/json" \
    "$url" 2>/dev/null || true)"

  if [[ -z "$result" ]]; then
    printf '{"error":"no response"}\n'
    return 1
  fi

  # Check for errors
  if echo "$result" | jq -e '.error' >/dev/null 2>&1; then
    printf '%s\n' "$result"
    return 1
  fi

  printf '%s\n' "$result"
  return 0
}

enrich_one() {
  local ip="$1" api_id="$2" api_secret="$3" json_out="$4"

  local raw
  raw="$(censys_lookup "$ip" "$api_id" "$api_secret" 15)" || true

  if [[ "$json_out" == "true" ]]; then
    printf '%s\n' "$raw"
    return
  fi

  # Compact summary
  local result
  result="$(jq -n --arg ip "$ip" --argjson raw "$raw" '
    def ports_summary:
      .result.services // [] | map(.port) | unique | sort;
    def os_summary:
      .result.services // [] | map(select(.service_name)) |
      group_by(.service_name) | map({svc: .[0].service_name, ports: [.[].port]});
    def location:
      (.result.location // {}) as $loc |
      [$loc.country // "", $loc.city // "", $loc.province // ""] |
      map(select(. != "")) | join(", ");
    def cloud:
      .result.labels // [] | map(select(test("aws|gcp|azure|cloud"; "i"))) | first // "on-prem";
    def asn:
      .result.autonomous_system // {} |
      "AS\(.asn // "?") \(.name // "")";
    {
      ip: $ip,
      location: location,
      cloud: cloud,
      asn: asn,
      os: os_summary,
      open_ports: ports_summary,
      last_updated: .result.last_updated_at // ""
    }
  ' <<<"$raw")"

  printf '%s\n' "$result"
}

main() {
  local ip="" api_id="${CENSYS_API_ID:-}" api_secret="${CENSYS_API_SECRET:-}"
  local ips_file="" json_out="false" cache_dir=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ip)            ip="$2";            shift 2 ;;
      --censys-id)     api_id="$2";        shift 2 ;;
      --censys-secret) api_secret="$2";    shift 2 ;;
      --ips-file)      ips_file="$2";      shift 2 ;;
      --json)          json_out="true";    shift ;;
      --cache-dir)     cache_dir="$2";     shift 2 ;;
      --help)          usage ;;
      *) die "unknown option: $1" ;;
    esac
  done

  [[ -n "$api_id" ]] || die "missing --censys-id or CENSYS_API_ID"
  [[ -n "$api_secret" ]] || die "missing --censys-secret or CENSYS_API_SECRET"

  # Collect IPs
  local ips=()
  if [[ -n "$ips_file" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      ips+=("$line")
    done <"$ips_file"
  elif [[ -n "$ip" ]]; then
    ips+=("$ip")
  else
    die "need --ip or --ips-file"
  fi

  local total="${#ips[@]}"
  printf '[%s] Enriching %s IPs via Censys...\n' "$(now_iso)" "$total" >&2

  # Output as JSON array
  local first=true
  printf '[\n'
  for ip_addr in "${ips[@]}"; do
    [[ "$first" == "true" ]] || printf ',\n'
    enrich_one "$ip_addr" "$api_id" "$api_secret" "$json_out"
    first=false
    printf '[%s] Enriched %s\n' "$(now_iso)" "$ip_addr" >&2
  done
  printf '\n]\n'
}

main "$@"
