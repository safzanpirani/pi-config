#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_jq_curl

usage() {
  cat <<'EOF'
Usage: probe-gradio.sh <target>

Probe a Gradio app (port 7860) to determine:
- App title, description
- GPU presence (via /info, /config, or page scraping)
- API endpoints available
- Whether it's an image/video/LLM app

Arguments:
  target    IP[:port] or http://host:port

Options:
  --timeout SEC  HTTP timeout in seconds (default: 8).
  --help         Show this message.

Output:
  JSON object with probe results.
EOF
  exit 1
}

main() {
  local target="" timeout="8"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --timeout) timeout="$2"; shift 2 ;;
      -h|--help) usage ;;
      *) target="$1"; shift ;;
    esac
  done

  [[ -n "$target" ]] || die "missing target"

  local base_url
  base_url="$(normalize_base_url "$target" 7860)"

  local summary='{"service":"gradio","target":"'"$target"'","base_url":"'"$base_url"'"}'

  # 1) /info (Gradio 3+ API)
  local info
  info="$(curl_json "$base_url/info" "$timeout")" || true
  if jq -e '.ok' <<<"$info" >/dev/null 2>&1; then
    local body
    body="$(jq '.body // {}' <<<"$info")"
    summary="$(jq --argjson b "$body" '. + {gradio_confirmed: true, info: $b}' <<<"$summary")"
    
    # Extract title
    local title
    title="$(jq -r '.body.title // empty' <<<"$info")"
    [[ -n "$title" && "$title" != "null" ]] && \
      summary="$(jq --arg t "$title" '. + {title: $t}' <<<"$summary")"
    
    # Extract description
    local desc
    desc="$(jq -r '.body.description // empty' <<<"$info")"
    [[ -n "$desc" && "$desc" != "null" ]] && \
      summary="$(jq --arg d "$desc" '. + {description: $d}' <<<"$summary")"
  fi

  # 2) /config
  local config
  config="$(curl_json "$base_url/config" "$timeout")" || true
  if jq -e '.ok' <<<"$config" >/dev/null 2>&1; then
    summary="$(jq --argjson c "$(jq '.body // {}' <<<"$config")" '. + {config: $c}' <<<"$summary")"
  fi

  # 3) Main page for title/signals
  local page
  page="$(curl -sS --max-time "$timeout" "$base_url" 2>/dev/null || true)"
  if [[ -z "$page" ]]; then
    summary="$(jq '. + {gradio_confirmed: false, error: "No response from main page"}' <<<"$summary")"
    printf '%s\n' "$summary"
    return 0
  fi

  # Extract title from HTML
  local html_title
  html_title="$(echo "$page" | sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' | head -1 || true)"
  [[ -n "$html_title" ]] && summary="$(jq --arg t "$html_title" '. + {html_title: $t}' <<<"$summary")"

  # Check for Gradio indicators
  local is_gradio="false"
  echo "$page" | grep -qi 'gradio' && is_gradio="true"
  echo "$page" | grep -qi 'svelte' && echo "$page" | grep -qi 'interface' && is_gradio="true"

  if [[ "$is_gradio" == "true" ]]; then
    summary="$(jq '. + {gradio_confirmed: true}' <<<"$summary")"
  elif jq -e '.gradio_confirmed == true' <<<"$summary" >/dev/null 2>&1; then
    : # already confirmed via /info
  else
    # Check if it's at least some web app
    if jq -e '.html_title' <<<"$summary" >/dev/null 2>&1; then
      summary="$(jq '. + {gradio_confirmed: false, note: "Web app found, may not be Gradio"}' <<<"$summary")"
    else
      summary="$(jq '. + {gradio_confirmed: false, error: "No Gradio indicators found"}' <<<"$summary")"
    fi
    printf '%s\n' "$summary"
    return 0
  fi

  # 4) /api/predict — check if inference API is available
  local api_info
  api_info="$(curl_json "$base_url/api" "$timeout")" || true
  if jq -e '.ok' <<<"$api_info" >/dev/null 2>&1; then
    summary="$(jq --argjson a "$(jq '.body // {}' <<<"$api_info")" '. + {api_info: $a}' <<<"$summary")"
  fi

  # 5) Classify app type from title and info
  summary="$(jq '
    def classify:
      . as $s |
      (($s.title // $s.html_title // $s.info.title // "") | ascii_downcase) as $t |
      (($s.description // $s.info.description // "") | ascii_downcase) as $d |
      if ($t + $d) | test("stable.diffusion|sdxl|flux|midjourney|dall-e|image.gen|txt2img|img2img")
        then "image_generation"
      elif ($t + $d) | test("llm|chat|gpt|llama|mistral|qwen|deepseek|prompt|assistant")
        then "llm_chat"
      elif ($t + $d) | test("video|animation|wan|hunyuan|animate")
        then "video_generation"
      elif ($t + $d) | test("tts|speech|voice|whisper|audio")
        then "audio"
      elif ($t + $d) | test("train|lora|fine.tune")
        then "training"
      else "unknown"
      end;
    . + {app_type: classify}
  ' <<<"$summary")"

  printf '%s\n' "$summary"
}

main "$@"
