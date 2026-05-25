# Live State Report

Snapshot source: `~/.pi/agent` on the current MacBook
Snapshot date: **2026-05-25**

## High-level state

- default provider: `openai-codex`
- default model: `gpt-5.5`
- thinking level: `xhigh`
- compaction: enabled
- transport: `websocket-cached`
- steering / follow-up mode: `all`
- last changelog version in settings: `0.75.4`

## Live config inventory

- enabled model patterns: 36
- configured packages: 13
- custom extension files in this public snapshot: 24
- prompt templates in this public snapshot: 8
- local Agent Skills in this public snapshot: 85

## Safe files mirrored publicly

- `settings.json` with live resource/package configuration
- `models.json` with real key material replaced by env-var names/placeholders
- `mcp.json` with placeholder MCP env values
- `auth.example.json` regenerated from private `auth.json` shape
- `extensions/` source and package manifests, excluding secret config
- `prompts/` prompt templates
- `skills/` dereferenced local Agent Skill snapshot, excluding caches/session notes
- setup scripts for macOS/Linux and Windows

## Intentionally not mirrored publicly

- `auth.json`
- `.env.pi`, `.env.pi.json`
- `mcp.json` real MCP values
- `extensions/exa-remote.json`
- runtime account state: `antigravity-accounts.json`, `codexswap.json`, `codex-fast.json`
- `sessions/`, `subagents/`, `cache/`, `pi-fff/`, `git/`, `npm/`, `node_modules/`
- backup files, crash logs, helper binaries

## Public repo goal

A clean, publishable mirror that exposes reusable Pi configuration, extensions, prompts, and skills while keeping every real secret in `pi-config-private` only.
