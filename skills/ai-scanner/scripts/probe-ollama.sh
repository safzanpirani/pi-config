#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_jq_curl

usage() {
  cat <<'EOF'
Usage: probe-ollama.sh <target>

Probe an Ollama server to determine if it is a real instance and collect
safe metadata (version, tags, model details).

Arguments:
  target    IP[:port] or http://host:port

Options:
  --max-show N      Max /api/show calls for detailed model info (default: 30).
  --timeout SEC     HTTP timeout in seconds (default: 6).
  --results-dir DIR Write JSONL output into this directory.

Output:
  A single JSON object written to stdout describing the probe result.
EOF
  exit 1
}

main() {
  local target="" max_show="30" timeout="6" results_dir

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --max-show) max_show="${2?"missing --max-show value"}"; shift 2 ;;
      --timeout)  timeout="${2?"missing --timeout value"}"; shift 2 ;;
      --results-dir) results_dir="${2?"missing --results-dir value"}"; shift 2 ;;
      -h|--help) usage ;;
      -*)
        if [[ -z "$target" ]]; then die "unknown option: $1 (did you forget the target argument?)"; fi
        shift ;;
      *) target="$1"; shift ;;
    esac
  done

  [[ -n "$target" ]] || die "missing target argument"

  local base_url
  base_url="$(normalize_base_url "$target" 11434)"

  local summary='{"service":"ollama","target":"'"$target"'","base_url":"'"$base_url"'"}'

  # 1) /api/version
  local ver
  ver="$(curl_json "$base_url/api/version" "$timeout")" || true
  if jq -e '.ok' <<<"$ver" >/dev/null 2>&1; then
    summary="$(jq --argjson v "$(jq '.body // {}' <<<"$ver")" '. + {version: $v, ollama_confirmed: true}' <<<"$summary")"
  else
    summary="$(jq '. + {ollama_confirmed: false, error: "Ollama /api/version probe failed"}' <<<"$summary")"
    printf '%s\n' "$summary"
    return 0
  fi

  # 2) /api/tags
  local tags
  tags="$(curl_json "$base_url/api/tags" "$timeout")" || true
  local models=()
  if jq -e '.ok' <<<"$tags" >/dev/null 2>&1; then
    local model_list
    model_list="$(jq -c '[.body.models[]?] // []' <<<"$tags")"
    summary="$(jq --argjson ml "$model_list" '. + {model_list: $ml}' <<<"$summary")"
    while IFS= read -r name; do
      [[ -n "$name" ]] && models+=("$name")
    done < <(jq -r '.[].name // empty' <<<"$model_list")
  else
    summary="$(jq '. + {model_list: []}' <<<"$summary")"
  fi

  # 3) /api/show for up to max_show models (needs POST)
  local detailed=()
  local count=0
  for name in "${models[@]}"; do
    [[ $count -ge $max_show ]] && break
    local show_body show_tmp
    show_tmp="$(mktemp)"
    curl -sS -L --max-time "$timeout" --connect-timeout "$timeout" \
      -H 'Content-Type: application/json' \
      -d "{\"name\":\"$name\"}" \
      -o "$show_tmp" \
      "$base_url/api/show" 2>/dev/null || true
    if [[ -s "$show_tmp" ]] && jq -e '.' "$show_tmp" >/dev/null 2>&1; then
      local safe_name
      safe_name="$(printf '%s' "$name" | jq -R '.')"
      detailed+=("$(jq -n --arg name "$name" --slurpfile show "$show_tmp" '{name: $name, show: $show[0]}')")
    fi
    rm -f "$show_tmp"
    count=$((count + 1))
  done
  if [[ ${#detailed[@]} -gt 0 ]]; then
    summary="$(jq --argjson d "$(printf '%s\n' "${detailed[@]}" | jq -s .)" '. + {model_details: $d}' <<<"$summary")"
  fi

  # 4) Derive metrics: model_count, max_model_params, max_context
  summary="$(jq '
    def model_count: .model_list | length;
    def max_model_params:
      def norm(p):
        if p | type == "number" then (p / 1e9 * 10 | floor / 10)
        elif p | type == "string" then
          if p | test("^[0-9.]+T$") then (p | sub("T$";"") | tonumber * 1000)
          elif p | test("^[0-9.]+B$") then (p | sub("B$";"") | tonumber)
          elif p | test("^[0-9.]+M$") then (p | sub("M$";"") | tonumber / 1000)
          elif p | test("^[0-9]+$") then (p | tonumber / 1e9 * 10 | floor / 10)
          else empty end
        else empty end;
      [.model_details[]?.show? |
        norm(.details.parameter_size // empty),
        norm(.model_info["general.parameter_count"] // empty)
      ]
      | map(select(. != null))
      | if length > 0 then max else null end;
    def max_context:
      [.model_details[]?.show?.model_info? // {} | to_entries[]?
       | select(.key | test("context_length"))
       | .value?]
      | map(tonumber? // empty)
      | if length > 0 then max else null end;
    . + {
      model_count: model_count,
      max_model_params: max_model_params,
      max_context: max_context
    }
    ' <<<"$summary")"

  printf '%s\n' "$summary"
  return 0
}

main "$@"
