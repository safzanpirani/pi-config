# Safzan Proxy / AgentRouter Claude Code Extension

Registers direct AgentRouter-backed Claude models for pi using the native Anthropic Messages API.

## What it does

- Reads the AgentRouter API key from `~/.pi/agent/auth.json` (`agentrouter.key`) or `AGENTROUTER_API_KEY`
- Sends requests directly to `https://agentrouter.org` (Anthropic SDK targets `/v1/messages`)
- Impersonates Claude Code with the exact required headers
- Uses pi's native `anthropic-messages` transport, so streaming usage and tool calling work correctly
- Registers both `agentrouter/claude-opus-4-6` and `safzan-proxy/claude-opus-4-6`

## Registered models

- `agentrouter/claude-opus-4-6`
- `safzan-proxy/claude-opus-4-6`
- `llamacpp/qwen3.5-35b-a3b-ud-q4_k_xl`

## Notes

This replaces the older VibeProxy/OpenAI-compat route for Claude Opus 4.6. The model now talks to AgentRouter as a native Anthropic Messages endpoint, which fixes:

- `usage: null` streaming chunks
- missing tool calling support
- broken Anthropic-specific streaming semantics
