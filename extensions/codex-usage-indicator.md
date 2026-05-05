# codex-usage-indicator

A pi extension that shows live OpenAI Codex usage (5h primary window + 7d secondary window) as two horizontal bars below the editor, polled every 30s.

![target look]: two side-by-side bars, e.g. `━━━|━━━━━━━━━━━━ 22% · 3h13m→7:09am  ━━━━━━|━━━━━━━━ 46% · 2d6h→29 Apr 10:22am`

## Files

- `codex-usage-indicator.ts` — the extension, auto-discovered by pi from `~/.pi/agent/extensions/`.
- `codex-usage-indicator.md` — this file.

## What it does

- Polls `https://chatgpt.com/backend-api/wham/usage` every 30s using the `openai-codex` access token + `accountId` from `~/.pi/agent/auth.json`.
- Renders two bars in a `belowEditor` widget — primary (5h) and secondary (7d).
- Refreshes immediately after each `turn_end` so the bar moves within ~1s of consuming quota.
- Hides itself when the active model isn't an `openai-codex` model; reappears on `model_select` back to codex.
- Exposes `/codex-usage-refresh` for an on-demand poll.

## Bar semantics (important)

This is the part that's easy to get wrong. Each bar encodes **two** values:

- **Filled portion (left, colored)** = `used_percent` from the API.
- **Cursor `|`** = elapsed time within the window, computed as
  `(limit_window_seconds - (reset_at - now)) / limit_window_seconds`.
- **Track (right of cursor, dim)** = remaining time.

So if the colored fill extends **past** the cursor, you're burning quota faster than the clock; if it ends **before** the cursor, you're under pace. The `meta` text after each bar shows `<used>% · <remaining>→<resetClock>`.

The fill color escalates: `success` (default) → `accent` (≥50% used) → `warning` (≥75% used **or** usage more than 10pp ahead of elapsed time) → `error` (≥90% used).

## Codex usage API

`GET https://chatgpt.com/backend-api/wham/usage`

Headers:
- `Authorization: Bearer <auth.json["openai-codex"].access>`
- `ChatGPT-Account-Id: <auth.json["openai-codex"].accountId>` (only if present)
- `Accept: application/json`

Response shape (only the fields used here):

```json
{
  "plan_type": "team",
  "rate_limit": {
    "primary_window":   { "used_percent": 22.4, "limit_window_seconds": 18000,  "reset_at": 1777891740 },
    "secondary_window": { "used_percent": 46.8, "limit_window_seconds": 604800, "reset_at": 1778057520 }
  }
}
```

`reset_at` is unix seconds. A 401/403 means the JWT is stale — pi will refresh it on the next provider call, so we just surface "auth expired" and let the next 30s tick re-read `auth.json`.

The token can also be found via the same path the official codex adapter uses:
`~/.pi/agent/git/github.com/aliou/pi-extensions/extensions/providers/lib/adapters/codex.ts`. That file is the canonical reference for the request shape.

## Pi APIs used

| API | Purpose |
| --- | --- |
| `pi.on("session_start", ...)` | Start polling, install the widget, capture `ctx`. |
| `pi.on("model_select", ...)` | Hide widget if non-codex; re-enable + tick on codex. |
| `pi.on("turn_end", ...)` | Trigger an immediate poll for fast feedback. |
| `pi.on("session_shutdown", ...)` | Clear interval, abort in-flight fetch, clear widget. |
| `ctx.ui.setWidget(key, lines, { placement: "belowEditor" })` | Render the bars between editor and footer. |
| `ctx.ui.theme.fg(colorName, text)` | Apply theme-aware ANSI color. Palette used: `success`, `accent`, `warning`, `error`, `dim`. |
| `pi.registerCommand("codex-usage-refresh", ...)` | Manual refresh slash-command. |
| `ctx.model.provider === "openai-codex"` | Detect codex-active state. |

Refer to `~/.nvm/versions/node/v22.20.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md` (sections "Widgets, Status, and Footer", "Examples Reference") and `examples/extensions/widget-placement.ts` / `status-line.ts` / `custom-footer.ts` for primitives.

## Architecture notes

- Single-file extension, default-export factory `(pi: ExtensionAPI) => void`.
- Module-level state is bound via closure inside the factory: `timer`, `abort: AbortController`, `snapshot`, `activeCtx`.
- `tick()` aborts any in-flight request before issuing a new one. `fetchUsage()` also wraps the per-request signal with `AbortSignal.timeout(8s)` via `AbortSignal.any`.
- `auth.json` is re-read on every poll instead of caching the token, so pi's background JWT refresh is picked up automatically.
- Width comes from `process.stdout.columns`; on resize, the next tick re-renders at the new width. (Fine for a 30s indicator; if instant resize handling matters, swap to the `setWidget` factory form `(tui, theme) => Component` and use `tui.requestRender()` on resize.)
- The TS file is loaded by pi via [jiti](https://github.com/unjs/jiti); no build step.

## Install / activate

The file lives in `~/.pi/agent/extensions/`, so pi auto-discovers it on startup. After editing, run `/reload` inside pi (no restart needed). To disable, move or rename the file.

## Known limits

- Bars use `process.stdout.columns` — won't react to terminal resize until the next tick.
- If you switch to a non-codex model mid-session, the widget hides; if you switch back, it reappears with stale data until the next tick (which fires immediately on `model_select`).
- The 401 path doesn't proactively trigger a token refresh — it relies on pi to do that on the next provider call. In practice this means the `auth expired` state self-heals as soon as you send any message.

---

## Recreation prompt

Hand the prompt below to a coding agent (Claude Code, Codex, etc.) to recreate the extension from scratch.

```
Build a pi (the @mariozechner/pi-coding-agent CLI) extension that shows a live
OpenAI Codex usage indicator below the editor, refreshed every 30 seconds.

Use the local Pi docs as the source of truth — do NOT invent APIs:
  ~/.nvm/versions/node/v22.20.0/lib/node_modules/@mariozechner/pi-coding-agent/README.md
  ~/.nvm/versions/node/v22.20.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
  ~/.nvm/versions/node/v22.20.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/sdk.md
  ~/.nvm/versions/node/v22.20.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md
  ~/.nvm/versions/node/v22.20.0/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/

Read these examples first — they cover the exact primitives you need:
  examples/extensions/widget-placement.ts   # setWidget belowEditor
  examples/extensions/status-line.ts        # ctx.ui.setStatus + theme.fg + session events
  examples/extensions/custom-footer.ts      # similar lifecycle pattern
  examples/extensions/working-indicator.ts  # registerCommand + ctx
The official Codex usage adapter lives at:
  ~/.pi/agent/git/github.com/aliou/pi-extensions/extensions/providers/lib/adapters/codex.ts
Use it as the canonical reference for the HTTP request shape.

Goal:
  Single-file TypeScript extension at ~/.pi/agent/extensions/codex-usage-indicator.ts.
  Default-export a factory `(pi: ExtensionAPI) => void`. No build step (pi loads
  via jiti). Imports allowed: @mariozechner/pi-coding-agent, node:fs, node:os,
  node:path. No npm deps.

Behavior:
  1. On `session_start` (and only when `ctx.hasUI`), capture ctx, install a widget
     under key "codex-usage" with `{ placement: "belowEditor" }`, and start a
     `setInterval` that polls every 30,000 ms. Call `timer.unref()`.
  2. Each tick fetches:
       GET https://chatgpt.com/backend-api/wham/usage
       Authorization: Bearer <openai-codex.access from ~/.pi/agent/auth.json>
       ChatGPT-Account-Id: <openai-codex.accountId>   (omit header if absent)
       Accept: application/json
     Re-read auth.json on every tick (don't cache the token). Wrap fetch with
     `AbortSignal.timeout(8000)` combined via `AbortSignal.any` with a per-tick
     AbortController so a new tick can cancel the previous in-flight request.
  3. Response shape (only these fields matter):
       {
         plan_type?: string,
         rate_limit?: {
           primary_window?:   { used_percent?, limit_window_seconds?, reset_at? } | null,
           secondary_window?: { used_percent?, limit_window_seconds?, reset_at? } | null
         }
       }
     `reset_at` is unix seconds. 401/403 → render "auth expired"; other non-OK →
     "HTTP <status>"; thrown errors → message.
  4. Render two bars (primary first if present, secondary if present) joined by
     two spaces. Each bar's structure, character by character across the width
     (use `process.stdout.columns`, sized so each bar gets roughly half of
     `terminalWidth - meta_text_widths - separators`):
       - filled cells [0, filledEnd) where filledEnd = round(usage_pct/100 * w)
         → drawn as "━" in the fill color
       - cursor cell at `cursorPos` = round(elapsed_pct/100 * (w-1))
         → drawn as "|" in `accent`, replacing whatever character would be there
       - all other cells → "━" in `dim`
     elapsed_pct = clamp01((limit_window_seconds - max(0, reset_at - now_seconds))
                            / limit_window_seconds) * 100, when both fields exist;
     fall back to usage_pct if missing. Coalesce consecutive same-color cells
     into runs and apply `theme.fg(color, "━".repeat(n))` per run for fewer
     ANSI escapes.
   Fill color rules (apply only to the colored fill, not the cursor/track):
       usage >= 90                      → "error"
       usage >= 75                      → "warning"
       usage >= elapsed_pct + 10        → "warning"   (over pace)
       usage >= 50                      → "accent"
       else                             → "success"
     Meta text after each bar:
       `<usage>% · <remaining>→<resetClock>`
     where `<remaining>` formats as Nd[Nh] / Nh[Nm] / Nm and `<resetClock>` is
     a lowercase `h:mma` if same-day else `<d Mon> <h:mma>`. Color the meta
     text with the same fill color.
     No "Codex Plan |" prefix. No leading separator. Just bars + meta, joined
     by two spaces.
  5. Hook `pi.on("turn_end", ...)` to call `tick()` for instant feedback.
  6. Hook `pi.on("model_select", ...)`: if `ctx.model?.provider === "openai-codex"`
     re-render and tick; otherwise call `ctx.ui.setWidget("codex-usage", undefined)`
     to hide.
  7. Hook `pi.on("session_shutdown", ...)` to `clearInterval`, abort the in-flight
     fetch, clear the widget, and drop ctx references.
  8. Register a `/codex-usage-refresh` slash command via `pi.registerCommand` that
     forces a tick and `ctx.ui.notify("Codex usage refreshed", "info")`.

Constraints:
  - Verify everything against the docs/examples — do not invent UI or event APIs.
  - Use `Model.provider` (a string) to detect codex; don't hardcode model IDs.
  - Use `theme.fg(...)` for color. Palette: success, accent, warning, error, dim.
  - Don't add error handling for impossible cases. Trust pi to provide ctx in
    handlers. Do gracefully handle a missing/invalid auth.json (render "no
    codex auth").
  - Keep the file ~200 lines. No comments except where the WHY is non-obvious
    (the bar semantics — cursor = elapsed time, fill = usage — is the one place
    a comment is justified).

Deliverables:
  - The single .ts file at the path above.
  - A short usage line: drop the file in ~/.pi/agent/extensions/, run /reload
    inside pi.
```
