---
name: ai-scanner
description: Discover and probe publicly exposed Ollama (11434) and ComfyUI (8188) instances via Shodan, classify them, cache IPs over time, and optionally enrich with GPU details. Use when asked to find, scan, probe, verify, or report on open AI-hosting hosts, ComfyUI instances, or Ollama servers.
---

# AI Scanner

Passive Shodan-based discovery of Ollama and ComfyUI hosts, with a persistent
IP cache that grows over time.

## Quick start

```bash
# Cookie from browser DevTools → Application → Cookies → polito (bare hash OK)
export SHODAN_COOKIE="d6861f92d57f..."

# ✅ PARALLEL probing (always use for >1 IP)
scripts/shodan-search.sh 'port:11434 html:"Ollama"' --pages 2 \
  | jq -r '.[].ip' \
  | scripts/probe-batch.sh --service ollama --concurrency 10

# With target filter (only matching hosts output)
scripts/shodan-search.sh 'port:11434 html:"Ollama"' --pages 2 \
  | jq -r '.[].ip' \
  | scripts/probe-batch.sh --service ollama --target-model deepseek-v4-pro

# GPU hunting
scripts/shodan-search.sh 'port:8188 html:"ComfyUI"' --pages 2 \
  | jq -r '.[].ip' \
  | scripts/probe-batch.sh --service comfyui --target-gpu 5090 --concurrency 8

# Single host (only when debugging one IP)
scripts/probe-ollama.sh 1.2.3.4:11434
```

## Parallel probing (default for >1 IP)

Always use `probe-batch.sh` for multiple IPs. It probes N hosts concurrently,
applies GPU/model filters, and outputs only matches.

```bash
# Search + probe + filter — one pipeline
scripts/shodan-search.sh 'port:11434 html:"Ollama"' --pages 2 \
  | jq -r '.[].ip' \
  | scripts/probe-batch.sh --service ollama --target-model qwen --concurrency 12

# From cached IPs
scripts/cache-ips.sh --list \
  | jq -r '.[] | select(.service=="ollama") | .ip' \
  | scripts/probe-batch.sh --service ollama --concurrency 10
```

`probe-batch.sh` flags:
- `--service` (required) — `ollama` or `comfyui`
- `--concurrency N` — parallel probes (default 10)
- `--target-model TEXT` — Ollama: filter by model name (case-insensitive)
- `--target-gpu TEXT` — ComfyUI: filter by GPU name
- `--filter TEXT` — match against any field
- `--json` — output full JSON instead of summary line

## Daily cache workflow

```bash
# 1) Accumulate (skip --clear to grow over time)
scripts/cache-ips.sh --pages 2

# 2) Check growth
scripts/cache-ips.sh --list | jq 'length'

# 3) Probe uncached hosts (coming soon: --probe-new flag)
```

Cache file: `.cache/ips.jsonl` (set `AI_SCANNER_CACHE_DIR` to override).
Each entry: `{"ip","port","service","first_seen"}`.

## Scripts

| Script | What it does |
|---|---|
| `scripts/probe-batch.sh` | **Parallel probing (use this).** Reads IPs from stdin, probes N at a time, filters by model/GPU. Supports ollama, comfyui, gradio, jupyter. |
| `scripts/shodan-search.sh` | Query Shodan via API (paid) or web scrape (cookie). Outputs `[{"ip":"...","port":N}]`. |
| `scripts/probe-ollama.sh` | Single-host probe: `/api/version`, `/api/tags`, `/api/show` (POST). Derives metrics. |
| `scripts/probe-comfy.sh` | Single-host probe: `/system_stats`, `/models`, `/object_info`. GPU, VRAM, RAM. |
| `scripts/probe-gradio.sh` | Single-host probe: `/info`, `/config`, page scraping. App type classification. |
| `scripts/cache-ips.sh` | Scrape Shodan, dedupe, append new IPs to `.cache/ips.jsonl`. Supports `--targets all`, `--targets ai`, multi-service. |
| `scripts/run-pipeline.sh` | **End-to-end pipeline:** search → parallel probe → JSONL output. Fully functional. |
| `scripts/comfyui-submit.py` | **ComfyUI workflow builder & job submitter.** Construct valid workflows, submit to `/prompt`, poll `/history`, download results. Supports txt2img and img2vid. |
| `scripts/enrich-censys.sh` | Censys host lookup enrichment (free tier). OS, open ports, ASN, cloud provider. |
| `scripts/ollama-bridge.py` | Python stdlib bridge: OpenAI `/v1/chat/completions` → Ollama `/api/generate`. For cloud models. |
| `scripts/probe-quick.sh` | Quick probe for Jupyter/SSH/Gradio. Lightweight banner/page check. |

### ComfyUI Job Submission

```bash
# List available models, GPUs, nodes
python3 scripts/comfyui-submit.py --host http://120.240.155.198:8188 --list

# Text-to-image (Flux/SDXL)
python3 scripts/comfyui-submit.py --host http://120.240.155.198:8188 \
  --mode txt2img --prompt "sunset over mountains" \
  --checkpoint flux1-schnell-fp8.safetensors \
  --steps 4 --width 512 --height 512 --output-dir ./generated

# Image-to-video
python3 scripts/comfyui-submit.py --host http://120.240.155.198:8188 \
  --mode img2vid --image input.png --model wan2.2_i2v \
  --prompt "cinematic camera movement" --output-dir ./output

# Monitor progress (job submitted to /prompt, polled via /queue + /history)
# Results auto-downloaded to --output-dir
```

## Verified Compute Machines

| Host | GPU | VRAM Free | Capability |
|---|---|---|---|
| `120.240.155.198:8188` | A100 40GB | 33.5GB | ✅ Flux txt2img verified (116s for 512×512) |
| `115.244.188.206:8188` | RTX 5090 32GB | 30.7GB | Bare install, 951 nodes |
| `117.50.221.153:8188` | RTX 4090 24GB | 2.2GB | 195 video models |
| `78.21.175.54:11434` | Ollama (72 models) | — | Kimi K2.6 1T, DeepSeek V4 Pro |

## Probe output

```json
{
  "service": "ollama",
  "target": "1.2.3.4:11434",
  "base_url": "http://1.2.3.4:11434",
  "ollama_confirmed": true,
  "version": {"version": "0.21.1"},
  "model_list": [...],
  "model_details": [{"name": "llama3.2", "show": {...}}],
  "model_count": 5,
  "max_model_params": 36.0,
  "max_context": 262144
}
```

## Discovery sources

| Source | Free | What |
|---|---|---|
| **Shodan** (cookie) | ✅ | Web scrape — best free option. Cookie from browser. |
| **Censys** (PAT) | ⚠️ | Host lookup (enrichment) only. No search on free tier. |
| **Zoomeye** (API) | ❌ | Free tier no longer includes API search. |
| **FOFA** | ❌ | Needs paid account. |

## Safety

All probes are passive HTTP GET (and POST for `/api/show`) to documented
API paths. No exploitation, no raw internet scanning. Candidates from Shodan only.
