#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_jq_curl

usage() {
  cat <<'EOF'
Usage: run-pipeline.sh [OPTIONS]

Full discovery pipeline:
1) Shodan search (ComfyUI + Ollama).
2) Parallel probe each candidate host.
3) Collect results as JSONL.
4) Summary printed to stdout.

Options:
--shodan-key KEY   Shodan API key (env SHODAN_API_KEY).
--shodan-cookie C  Shodan session cookie for web scraping (env SHODAN_COOKIE).
--limit N          Shodan result limit per query (default: 100).
--timeout SEC      HTTP probe timeout in seconds (default: 6).
--concurrency N    Max parallel probes (default: 10).
--results-dir DIR  Write results as JSONL here.
--service S        Only scan one service (comfyui|ollama).
--pages N          Shodan web scrape pages (default: 2).
--help             Show this message.

Output:
  JSONL file per run in --results-dir (auto-generated if not specified).
  Each line: {"run_id":"...","type":"candidate",...} or {"run_id":"...","type":"probe_result",...}
  Summary printed to stderr.
EOF
  exit 1
}

main() {
  local shodan_key="${SHODAN_API_KEY:-}" shodan_cookie="${SHODAN_COOKIE:-}" limit="100" timeout="6" concurrency="10"
  local results_dir="" service_filter="" pages="2"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --shodan-key)    shodan_key="$2";    shift 2 ;;
      --shodan-cookie) shodan_cookie="$2"; shift 2 ;;
      --limit)         limit="$2";         shift 2 ;;
      --timeout)       timeout="$2";       shift 2 ;;
      --concurrency)   concurrency="$2";   shift 2 ;;
      --results-dir)   results_dir="$2";   shift 2 ;;
      --service)       service_filter="$2"; shift 2 ;;
      --pages)         pages="$2";         shift 2 ;;
      --help)          usage ;;
      *) die "unknown option: $1" ;;
    esac
  done

  results_dir="$(ensure_results_dir "$results_dir")"
  local run_id ts outfile tmpdir
  ts="$(date -u +"%Y%m%dT%H%M%SZ")"
  run_id="run-${ts}"
  outfile="${results_dir}/${run_id}.jsonl"
  tmpdir="$(mktemp -d)"

  # Write run header
  printf '{"type":"run_start","run_id":"%s","started_at":"%s","config":{"limit":%s,"timeout":%s,"concurrency":%s,"service":"%s","pages":%s}}\n' \
    "$run_id" "$(now_iso)" "$limit" "$timeout" "$concurrency" "${service_filter:-all}" "$pages" >>"$outfile"

  # 1) Shodan discovery
  local search_label="ComfyUI + Ollama"
  local queries=("port:8188 html:\"ComfyUI\"" "port:11434 html:\"Ollama\"")
  if [[ "$service_filter" == "comfyui" ]]; then
    queries=("port:8188 html:\"ComfyUI\"")
    search_label="ComfyUI only"
  elif [[ "$service_filter" == "ollama" ]]; then
    queries=("port:11434 html:\"Ollama\"")
    search_label="Ollama only"
  fi

  printf '[%s] Step 1/3: Shodan discovery (%s)\n' "$(now_iso)" "$search_label" >&2

  local shodan_args=()
  [[ -n "$shodan_cookie" ]] && shodan_args+=(--cookie "$shodan_cookie")
  shodan_args+=(--limit "$limit" --pages "$pages")
  if [[ -n "$shodan_key" ]]; then
    shodan_args+=(--key "$shodan_key")
  fi

  local shodan_combined=""
  for q in "${queries[@]}"; do
    local raw
    raw="$("$SCRIPT_DIR/shodan-search.sh" "$q" "${shodan_args[@]}" 2>/dev/null || echo '[]')"
    shodan_combined="$(jq -s 'add' <(printf '%s\n' "$shodan_combined") <(printf '%s\n' "$raw") 2>/dev/null || echo '[]')"
  done

  shodan_combined="$(jq 'unique_by({ip, port})' <<<"$shodan_combined")"
  local candidate_count
  candidate_count="$(jq 'length' <<<"$shodan_combined")"
  printf '[%s] %s unique targets\n' "$(now_iso)" "$candidate_count" >&2

  if [[ "$candidate_count" -eq 0 ]]; then
    printf '{"type":"run_end","run_id":"%s","finished_at":"%s","status":"no_candidates","candidates":0,"probed":0}\n' \
      "$run_id" "$(now_iso)" >>"$outfile"
    printf 'Pipeline complete (no candidates): %s\n' "$outfile" >&2
    rm -rf "$tmpdir"
    return 0
  fi

  # Write raw candidates to JSONL
  jq -c --arg rid "$run_id" --arg ts "$(now_iso)" \
    '.[] | {type:"candidate", run_id: $rid, timestamp: $ts, ip, port}' \
    <<<"$shodan_combined" >>"$outfile"

  # 2) Parallel probe — write each result to tmpdir, then collect
  printf '[%s] Step 2/3: Probing %s candidates (concurrency=%s, timeout=%ss)\n' \
    "$(now_iso)" "$candidate_count" "$concurrency" "$timeout" >&2

  local i=0 probe_count=0
  while IFS= read -r candidate; do
    local ip port service probe_script
    ip="$(jq -r '.ip' <<<"$candidate")"
    port="$(jq -r '.port' <<<"$candidate")"
    [[ -z "$ip" || "$ip" == "null" ]] && continue

    case "$port" in
      8188)  service="comfyui"; probe_script="$SCRIPT_DIR/probe-comfy.sh" ;;
      11434) service="ollama";   probe_script="$SCRIPT_DIR/probe-ollama.sh" ;;
      *) continue ;;
    esac

    probe_count=$((probe_count + 1))
    (
      outfile_i="${tmpdir}/probe_${probe_count}.json"
      res="$("$probe_script" "${ip}:${port}" --timeout "$timeout" 2>/dev/null || printf '{"error":"probe failed"}')"
      jq -c --arg rid "$run_id" --arg ts "$(now_iso)" --arg svc "$service" \
        '. + {type:"probe_result", run_id:$rid, timestamp:$ts, service:$svc}' \
        <<<"$res" >"$outfile_i" 2>/dev/null || true
    ) &

    if [[ $((probe_count % concurrency)) -eq 0 ]]; then
      wait
      printf '[%s]   %s/%s probed...\n' "$(now_iso)" "$probe_count" "$candidate_count" >&2
    fi
  done < <(jq -c '.[]' <<<"$shodan_combined")
  wait
  printf '[%s] Step 2/3: All %s hosts probed\n' "$(now_iso)" "$probe_count" >&2

  # 3) Collect probe results from tmpdir into JSONL
  printf '[%s] Step 3/3: Collecting results\n' "$(now_iso)" >&2

  local collected=0
  local confirmed=0
  for f in "$tmpdir"/probe_*.json; do
    [[ -f "$f" ]] || continue
    cat "$f" >>"$outfile"
    collected=$((collected + 1))
    if jq -e '(.ollama_confirmed == true) or (.comfyui_confirmed == true)' "$f" >/dev/null 2>&1; then
      confirmed=$((confirmed + 1))
    fi
  done

  # Write summary
  printf '{"type":"run_end","run_id":"%s","finished_at":"%s","status":"complete","candidates":%s,"probed":%s,"confirmed":%s}\n' \
    "$run_id" "$(now_iso)" "$candidate_count" "$collected" "$confirmed" >>"$outfile"

  rm -rf "$tmpdir"

  printf 'Pipeline complete: %s candidates, %s probed, %s confirmed\n' \
    "$candidate_count" "$collected" "$confirmed" >&2
  printf 'Results: %s\n' "$outfile" >&2
}

main "$@"
