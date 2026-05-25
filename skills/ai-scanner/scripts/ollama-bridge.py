#!/usr/bin/env python3
"""Minimal bridge: OpenAI /v1/chat/completions → Ollama /api/generate

Usage:
  python3 ollama-bridge.py [--port 8318] [--host http://TARGET:11434]
"""

import json, sys, http.server, urllib.request, argparse, os

OLLAMA_HOST = os.environ.get("OLLAMA_BRIDGE_HOST", "http://78.21.175.54:11434")

# Map short Pi ids → real Ollama names (Pi doesn't handle colons well)
MODEL_MAP = {
    "deepseek-v4-pro": "deepseek-v4-pro:cloud",
    "kimi-k2.6": "kimi-k2.6:cloud",
}

class Bridge(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/v1/models":
            try:
                req = urllib.request.Request(f"{OLLAMA_HOST}/api/tags")
                with urllib.request.urlopen(req, timeout=10) as r:
                    data = json.loads(r.read())
                models = [{"id": m["name"], "object": "model", "owned_by": "ollama"}
                          for m in data.get("models", [])]
                self._json(200, {"object": "list", "data": models})
            except Exception as e:
                self._json(500, {"error": str(e)})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/v1/chat/completions":
            try:
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                prompt = self._build_prompt(body.get("messages", []))
                model = body.get("model", "")
                # Map short ids to real Ollama names
                ollama_model = MODEL_MAP.get(model, model)
                max_tokens = body.get("max_tokens", 256)

                ollama_body = json.dumps({
                    "model": ollama_model,
                    "prompt": prompt,
                    "stream": False
                }).encode()

                req = urllib.request.Request(
                    f"{OLLAMA_HOST}/api/generate",
                    data=ollama_body,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=600) as r:
                    result = json.loads(r.read())

                # Merge thinking + response for reasoning models (e.g. DeepSeek R1, Kimi K2.6)
                thinking = result.get("thinking") or ""
                response = result.get("response") or result.get("message", {}).get("content") or ""
                content = ""
                if thinking:
                    content += thinking.strip()
                if response:
                    if content:
                        content += "\n\n" + response.strip()
                    else:
                        content = response.strip()
                if not content:
                    content = "[empty response from model]"

                self._json(200, {
                    "id": "ollama-" + model,
                    "object": "chat.completion",
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop"
                    }],
                    "usage": {
                        "prompt_tokens": result.get("prompt_eval_count", 0),
                        "completion_tokens": result.get("eval_count", 0),
                        "total_tokens": result.get("prompt_eval_count", 0) + result.get("eval_count", 0)
                    }
                })
            except Exception as e:
                self._json(500, {"error": str(e)})
        else:
            self._json(404, {"error": "not found"})

    def _build_prompt(self, messages):
        parts = []
        for m in messages:
            content = m.get("content") or ""
            if isinstance(content, list):
                texts = [p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"]
                content = " ".join(t for t in texts if t)
            if content:
                parts.append(str(content))
        return "\n".join(parts) if parts else "Hello"

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # silent

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8318)
    p.add_argument("--host", default=OLLAMA_HOST)
    args = p.parse_args()
    OLLAMA_HOST = args.host.rstrip("/")
    print(f"Ollama bridge → {OLLAMA_HOST} on :{args.port}", file=sys.stderr)
    http.server.HTTPServer(("127.0.0.1", args.port), Bridge).serve_forever()
