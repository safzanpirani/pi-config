#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_jq_curl

usage() {
  cat <<'EOF'
Usage: probe-comfy.sh <target>

Probe a ComfyUI server to determine if it is a real instance and collect
safe metadata (system_stats, models, object_info).

Arguments:
  target    IP[:port] or http://host:port

Options:
  --timeout SEC     HTTP timeout in seconds (default: 6).
  --results-dir DIR Write JSONL output into this directory.

Output:
  A single JSON object written to stdout describing the probe result.
EOF
  exit 1
}

sanitize_gpu_name() {
  local name="$1"
  name="${name#"cuda:"}"
  name="${name#[0-9] }"
  for suffix in ": cudaMallocAsync" ": cudaMalloc" ": default"; do
    name="${name%"$suffix"}"
  done
  printf '%s' "${name#"${name%%[![:space:]]*}"}"
}

pick_gpu_name() {
  local stats_json="$1"
  for key in devices gpus cuda gpu; do
    local val
    val="$(jq -r --arg k "$key" '.[$k] // empty' <<<"$stats_json")"
    [[ -z "$val" || "$val" == "null" ]] && continue
    if jq -e 'type == "array" and length > 0' <<<"$val" >/dev/null; then
      local first
      first="$(jq -r '.[0]' <<<"$val")"
      if jq -e 'type == "object"' <<<"$first" >/dev/null; then
        for nk in name device_name model product_name; do
          local n
          n="$(jq -r --arg nk "$nk" '.[$nk] // empty' <<<"$first")"
          if [[ -n "$n" && "$n" != "null" ]]; then
            sanitize_gpu_name "$n"
            return
          fi
        done
      fi
      if jq -e 'type == "string"' <<<"$first" >/dev/null; then
        sanitize_gpu_name "$first"
        return
      fi
    fi
    if jq -e 'type == "object"' <<<"$val" >/dev/null; then
      for nk in name device_name model product_name; do
        local n
        n="$(jq -r --arg nk "$nk" '.[$nk] // empty' <<<"$val")"
        if [[ -n "$n" && "$n" != "null" ]]; then
          sanitize_gpu_name "$n"
          return
        fi
      done
    fi
  done
  jq -r '.gpu_name // empty' <<<"$stats_json"
}

main() {
  local target="" timeout="6" results_dir

  while [[ $# -gt 0 ]]; do
    case "$1" in
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
  base_url="$(normalize_base_url "$target" 8188)"

  local summary='{"service":"comfyui","target":"'"$target"'","base_url":"'"$base_url"'"}'

  # 1) /system_stats
  local stats
  stats="$(curl_json "$base_url/system_stats" "$timeout")" || true
  if jq -e '.ok' <<<"$stats" >/dev/null 2>&1; then
    summary="$(jq --argjson s "$(jq '.body // {}' <<<"$stats")" '. + {system_stats: $s}' <<<"$summary")"
    local gpu_name version
    gpu_name="$(pick_gpu_name "$(jq -r '.body // {}' <<<"$stats")" || true)"
    version="$(jq -r '[.body.comfyui_version, .body.version, .body.system.comfyui_version // empty] | map(select(. != null)) | first // null' <<<"$stats" || true)"
    summary="$(jq --arg gpu "${gpu_name:-null}" --arg ver "${version:-null}" '. + {comfyui_confirmed: true, gpu_name: ($gpu | if . == "null" then null else . end), version: ($ver | if . == "null" then null else . end)}' <<<"$summary")"

    # VRAM/RAM from system_stats
    summary="$(jq '
      def gb(val): if (val | type) == "number" then (val / 1073741824 * 10 | floor) / 10 else null end;
      def first_device: (.system_stats.devices // []) | if type == "array" and length > 0 then .[0] else {} end;
      . + {
        vram_total_gb: (gb(first_device.vram_total // first_device.torch_vram_total // .system_stats.system.vram_total // .system_stats.vram_total // null)),
        vram_free_gb:  (gb(first_device.vram_free  // first_device.torch_vram_free  // .system_stats.system.vram_free  // .system_stats.vram_free  // null)),
        ram_total_gb:  gb(.system_stats.system.ram_total   // .system_stats.ram_total   // null),
        ram_free_gb:   gb(.system_stats.system.ram_free    // .system_stats.ram_free    // null)
      }
    ' <<<"$summary")"
  else
    summary="$(jq '. + {comfyui_confirmed: false, error: "ComfyUI /system_stats probe failed"}' <<<"$summary")"
    printf '%s\n' "$summary"
    return 0
  fi

  # 2) /models
  local models
  models="$(curl_json "$base_url/models" "$timeout")" || true
  if jq -e '.ok' <<<"$models" >/dev/null 2>&1; then
    summary="$(jq --argjson m "$(jq '.body // {}' <<<"$models")" '. + {models: $m}' <<<"$summary")"
    local mc
    mc="$(jq '
      def count_models:
        if type == "object" then
          [to_entries[] | select(.key != "types") | .value | if type == "array" then length else 0 end] | add
        elif type == "array" then length
        else 0 end;
      count_models
    ' <<<"$(jq -c '.body' <<<"$models")" || echo 0)"
    summary="$(jq --argjson mc "$mc" '. + {model_count: $mc}' <<<"$summary")"
  fi

  # 3) /object_info
  local obj_info
  obj_info="$(curl_json "$base_url/object_info" "$timeout")"
  if jq -e '.ok' <<<"$obj_info" >/dev/null; then
    local nc
    nc="$(jq '.body | if type == "object" then length else null end' <<<"$obj_info" || echo null)"
    summary="$(jq --argjson nc "$nc" '. + {node_count: $nc}' <<<"$summary")"
  fi

  printf '%s\n' "$summary"
  return 0
}

main "$@"
