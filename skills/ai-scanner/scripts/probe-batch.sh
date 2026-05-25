#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_jq_curl

usage() {
  cat <<'EOF'
Usage: probe-batch.sh --service (ollama|comfyui|gradio|jupyter) [OPTIONS]

Read IPs from stdin (one per line), probe them in parallel.

Options:
  --service S        Required: ollama, comfyui, gradio, or jupyter.
  --concurrency N    Max parallel probes (default: 10).
  --timeout SEC      HTTP timeout per probe (default: 6).
  --max-show N       Ollama: max /api/show calls per host (default: 5).
  --target-model TEXT Ollama: only output if model name contains this (case-insensitive).
  --target-gpu TEXT  ComfyUI: only output if GPU contains this.
  --filter TEXT      Match against any field in probe output (case-insensitive).
  --json             Output full JSON for each match (default: summary line).
  --help             Show this message.

Examples:
  cat ips.txt | probe-batch.sh --service ollama --target-model deepseek
  cat ips.txt | probe-batch.sh --service comfyui --target-gpu 5090
  cat ips.txt | probe-batch.sh --service gradio
  cat ips.txt | probe-batch.sh --service gradio --filter "image_generation"
EOF
  exit 1
}

main() {
  local service="" concurrency="10" timeout="6" max_show="5"
  local target_gpu="" target_model="" filter="" json_out="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --service)      service="$2";      shift 2 ;;
      --concurrency)  concurrency="$2";  shift 2 ;;
      --timeout)      timeout="$2";      shift 2 ;;
      --max-show)     max_show="$2";     shift 2 ;;
      --target-gpu)   target_gpu="$2";   shift 2 ;;
      --target-model) target_model="$2"; shift 2 ;;
      --filter)       filter="$2";       shift 2 ;;
      --json)         json_out="true";   shift ;;
      --help)         usage ;;
      *) die "unknown option: $1" ;;
    esac
  done

  [[ -n "$service" ]] || die "--service is required (ollama|comfyui|gradio|jupyter)"

  local port probe_script
  case "$service" in
    ollama)   port="11434"; probe_script="$SCRIPT_DIR/probe-ollama.sh" ;;
    comfyui)  port="8188";  probe_script="$SCRIPT_DIR/probe-comfy.sh" ;;
    gradio)   port="7860";  probe_script="$SCRIPT_DIR/probe-gradio.sh" ;;
    jupyter)  port="8888";  probe_script="$SCRIPT_DIR/probe-quick.sh" ;;
    *) die "unknown service: $service. Valid: ollama, comfyui, gradio, jupyter" ;;
  esac

  # Read IPs from stdin
  local ips=()
  while IFS= read -r ip; do
    [[ -z "$ip" ]] && continue
    ips+=("$ip")
  done

  local total="${#ips[@]}"
  [[ "$total" -gt 0 ]] || die "no IPs provided on stdin"

  printf '[%s] Probing %s %s hosts (concurrency=%s)...\n' "$(now_iso)" "$total" "$service" "$concurrency" >&2

  # Build temp worker script
  local worker
  worker="$(mktemp)"
  cat >"$worker" <<'WORKER'
#!/usr/bin/env bash
set -euo pipefail
ip="$1"; port="$2"; timeout="$3"; max_show="$4"; probe_script="$5"; service="$6"
target_model="$7"; target_gpu="$8"; json_out="$9"; filter="${10:-}"

if [ "$service" = "jupyter" ]; then
  result="$("$probe_script" "$ip" "$port" "jupyter" 2>/dev/null)" || exit 0
elif [ "$service" = "comfyui" ] || [ "$service" = "gradio" ]; then
  result="$("$probe_script" "${ip}:${port}" --timeout "$timeout" 2>/dev/null)" || exit 0
else
  result="$("$probe_script" "${ip}:${port}" --timeout "$timeout" --max-show "$max_show" 2>/dev/null)" || exit 0
fi

# Check if confirmed
confirmed="false"
case "$service" in
  ollama)  confirmed="$(echo "$result" | jq -r '.ollama_confirmed // false' 2>/dev/null)" || exit 0 ;;
  comfyui) confirmed="$(echo "$result" | jq -r '.comfyui_confirmed // false' 2>/dev/null)" || exit 0 ;;
  gradio)  confirmed="$(echo "$result" | jq -r '.gradio_confirmed // false' 2>/dev/null)" || exit 0 ;;
  jupyter) confirmed="$(echo "$result" | grep -q '^✅' 2>/dev/null && echo true || echo false)" || true ;;
esac
[ "$confirmed" = "true" ] || exit 0

# Apply GPU filter
if [ -n "$target_gpu" ]; then
  gpu="$(echo "$result" | jq -r '.gpu_name // ""' 2>/dev/null)" || true
  echo "$gpu" | tr '[:upper:]' '[:lower:]' | grep -qF "$(echo "$target_gpu" | tr '[:upper:]' '[:lower:]')" || exit 0
fi

# Apply model filter
if [ -n "$target_model" ]; then
  models="$(echo "$result" | jq -r '[.model_list[]?.name // empty] | join(",")' 2>/dev/null)" || true
  echo "$models" | tr '[:upper:]' '[:lower:]' | grep -qF "$(echo "$target_model" | tr '[:upper:]' '[:lower:]')" || exit 0
fi

# Apply generic filter
if [ -n "$filter" ]; then
  echo "$result" | tr '[:upper:]' '[:lower:]' | grep -qF "$(echo "$filter" | tr '[:upper:]' '[:lower:]')" || exit 0
fi

# Output
if [ "$json_out" = "true" ]; then
  printf '%s\n' "$result"
elif [ "$service" = "ollama" ]; then
  mc="$(echo "$result" | jq -r '.model_count // "?"' 2>/dev/null)" || true
  mmp="$(echo "$result" | jq -r '.max_model_params // "?"' 2>/dev/null)" || true
  ver="$(echo "$result" | jq -r '.version.version // "?"' 2>/dev/null)" || true
  printf '✅ %s:%s | v%s | %s models | max %sB\n' "$ip" "$port" "$ver" "$mc" "$mmp"
elif [ "$service" = "comfyui" ]; then
  gpu="$(echo "$result" | jq -r '.gpu_name // "?"' 2>/dev/null)" || true
  vram="$(echo "$result" | jq -r '.vram_total_gb // "?"' 2>/dev/null)" || true
  ver="$(echo "$result" | jq -r '.version // "?"' 2>/dev/null)" || true
  mc="$(echo "$result" | jq -r '.model_count // "?"' 2>/dev/null)" || true
  printf '✅ %s:%s | v%s | %s | %sGB VRAM | %s models\n' "$ip" "$port" "$ver" "$gpu" "$vram" "$mc"
elif [ "$service" = "gradio" ]; then
  title="$(echo "$result" | jq -r '.title // .html_title // "?"' 2>/dev/null)" || true
  atype="$(echo "$result" | jq -r '.app_type // "?"' 2>/dev/null)" || true
  printf '✅ %s:%s | %s | %s\n' "$ip" "$port" "$title" "$atype"
else
  printf '%s\n' "$result"
fi
WORKER
  chmod +x "$worker"

  # Parallel via xargs
  local output
  output="$(printf '%s\n' "${ips[@]}" | xargs -P "$concurrency" -I {} \
    "$worker" {} "$port" "$timeout" "$max_show" "$probe_script" "$service" \
    "$target_model" "$target_gpu" "$json_out" "$filter" 2>/dev/null)" || true

  rm -f "$worker"

  local matched
  if [[ -n "$output" ]]; then
    printf '%s\n' "$output"
    matched="$(printf '%s\n' "$output" | wc -l | tr -d ' ')"
  else
    matched="0"
  fi

  printf '[%s] Done: %s probed, %s matched\n' "$(now_iso)" "$total" "$matched" >&2
}

main "$@"
