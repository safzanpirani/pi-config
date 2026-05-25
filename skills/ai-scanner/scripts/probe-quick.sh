#!/usr/bin/env bash
# Quick probe for Jupyter (8888), Gradio (7860), SSH-gpu (22)
# Usage: probe-quick.sh <ip> <port> <target_name>
set -euo pipefail

ip="$1" port="$2" name="$3"

case "$name" in
  jupyter)
    response=$(curl -sS --max-time 6 "http://${ip}:${port}/api/contents" 2>/dev/null || true)
    if echo "$response" | jq -e '.content' >/dev/null 2>&1; then
      token=$(curl -sS --max-time 4 "http://${ip}:${port}/api" 2>/dev/null | jq -r '.version // "?"' 2>/dev/null || echo "?")
      echo "✅ ${ip}:${port} | Jupyter v${token} | API accessible"
    else
      title=$(curl -sS --max-time 6 "http://${ip}:${port}/" 2>/dev/null | sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' | head -1 || true)
      echo "  ${ip}:${port} | ${title:-no response}"
    fi
    ;;
  gradio)
    body=$(curl -sS --max-time 8 "http://${ip}:${port}/" 2>/dev/null || true)
    title=$(echo "$body" | sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' | head -1 || true)
    has_gpu=$(echo "$body" | grep -oi 'gradio\|huggingface\|stable.diffusion\|llm\|chat\|model\|inference' | head -3 | tr '\n' ' ' || true)
    if echo "$body" | grep -qi 'gradio'; then
      echo "✅ ${ip}:${port} | Gradio: ${title:-?} | ${has_gpu:-generic}"
    else
      echo "  ${ip}:${port} | ${title:-no response}"
    fi
    ;;
  ssh-gpu)
    banner=$(echo "" | nc -w 3 "$ip" "$port" 2>/dev/null | head -1 || true)
    if echo "$banner" | grep -qi "ssh\|openssh"; then
      echo "  ${ip}:${port} | SSH: ${banner:0:80}"
    else
      echo "  ${ip}:${port} | ${banner:-no banner}"
    fi
    ;;
  *)
    echo "  ${ip}:${port} | unknown target: $name"
    ;;
esac
