# Per-app sub-skill template — `.pi/skills/qa-<app-name>/SKILL.md`

For EACH detected app in `config.yaml`, generate a dedicated sub-skill. The sub-skill is the **menu of available test flows** for that app — the orchestrator picks only the flows relevant to the current diff.

## Frontmatter

Every sub-skill MUST have:

```yaml
---
name: qa-<app-name>          # Must match the directory name AND apps.<app-name>.skill in config.yaml
description: >
  QA tests for the <app-name> app. <one-line description of what it tests and how>.
---
```

## Required sections (in this order)

1. **Testing Target** — how to reach the app (preview URL, localhost, etc.)
2. **Authentication** — how this app authenticates in QA runs (env vars, secret keys)
3. **Test Flows** — the menu of available flows
4. **Per-Persona Variations** — only if multiple personas should exercise the app
5. **Known Failure Modes** — quirks discovered during the codebase scan; grows over time

## Section: Testing Target

### For web / frontend apps (MANDATORY)

Web sub-skills MUST include this exact testing-target logic.

**If the repo uses Vercel / Netlify preview deployments:**
1. Use the preview URL passed by the workflow (via env var or prompt) — do NOT re-resolve it.
2. If a Vercel bypass secret is needed, apply it on the first request (e.g., `?x-vercel-protection-bypass=$BYPASS`).
3. If no preview URL was provided, report ALL web tests as **BLOCKED**: "No Vercel preview URL available — cannot verify branch code." Do NOT fall back to dev/staging/prod URLs.

**If the repo does NOT use preview deployments:**
1. Start the dev server locally with the exact command (e.g., `npm run dev`).
2. Poll `http://localhost:<port>` until it returns 200.
3. Use `http://localhost:<port>` as the base URL.

**CRITICAL:** the sub-skill MUST NEVER fall back to a remote environment when testing a PR branch.

### For API / backend apps

- Document the local startup command and port.
- Provide a curl-based health check before running flows.
- If the API depends on a database, document seeding (use a disposable test DB).

### For CLI / TUI apps

Document the build command (`go build`, `cargo build`, `npm run build`, etc.) and the resulting binary path. The flows section will reference `tuistory` for interaction.

## Section: Authentication

Sub-skills that require authentication MUST document:
- Which env vars provide credentials for this app.
- That these are provided by the CI workflow via GitHub secrets — the agent does NOT log in interactively in CI.
- How the app consumes the credentials (header? cookie? OAuth flow?).

Example:

```markdown
## Authentication

This app uses OAuth via Clerk. In CI, the agent reads:
- `QA_ADMIN_EMAIL` / `QA_ADMIN_PASSWORD` — admin persona
- `QA_MEMBER_EMAIL` / `QA_MEMBER_PASSWORD` — member persona

Both are GitHub repository secrets (see install-qa output for the secrets checklist).
For local runs, set them in `.env.qa.local` (gitignored).
```

## Section: Test Flows

Each flow is a numbered Markdown subsection. Use this shape:

````markdown
### Flow N: <flow-name>

**When to run:** <which diffs trigger this flow>
**Persona:** <which persona executes it>
**Success criteria:** <what 'pass' looks like>

Steps:
1. <action>
2. <action>
3. Capture evidence: <what to snapshot>

Cleanup: <if anything was created, how to remove it>
````

Flow guidelines:
- A flow describes WHAT to test, not HOW to call low-level tools. Reference primitives (`agent-browser`, `tuistory`, `curl`) by name.
- Include at least one **negative test** (e.g., "verify a member cannot access /admin").
- For flows that create data, document the cleanup step explicitly.
- Group related flows under headings like "Onboarding flows", "Permissions flows", "Payments flows".

### Web flows — use `agent-browser`

Reference the `agent-browser` Pi skill (already installed at `~/.agents/skills/agent-browser`):

```markdown
Use the `agent-browser` skill for all browser interactions.

1. Navigate to <url>
2. Fill the form with <inputs>
3. Click <button>
4. Verify the page contains <expected-text>
5. Snapshot accessibility tree for evidence
```

The flow describes WHAT to verify, not the underlying CDP commands.

### CLI flows — use `tuistory` via `droid-control` skill (if available)

For CLI/TUI apps, the sub-skill MUST require **interactive TUI testing** — building the binary, launching it via `tuistory`, sending real keystrokes, verifying actual terminal output.

Use `droid-control` for all `tuistory` interactions if available; otherwise call `tuistory` directly.

```markdown
Use the `droid-control` skill (or raw `tuistory` if not installed) for all TUI interactions.

1. Launch the CLI binary: `tuistory launch "$CLI_BINARY" -s qa-test --cols 110 --rows 36`
2. Wait for the prompt to appear.
3. Type a command and verify the output.
4. Take a snapshot for evidence.
```

The sub-skill describes WHAT to test, not HOW to call tuistory.

CI notes:
- In CI, prefix the launch with `env -u CI FACTORY_DISABLE_KEYRING=true` to avoid Ink CI detection.
- Use session name `-s qa-test` with `--cols 110 --rows 36` for consistent snapshot widths.

### API flows — use `curl`

```markdown
1. POST to /api/<endpoint> with body <json>
2. Verify status code <code>
3. Verify response body matches <shape>
4. Snapshot the response for evidence
```

For authenticated endpoints, document which env var holds the token.

## Section: Per-Persona Variations

Only include if multiple personas should exercise this app. Otherwise omit.

```markdown
## Per-Persona Variations

| Persona | Focus | Negative tests |
|---------|-------|----------------|
| admin   | full CRUD on resources | none |
| member  | read + own-resource CRUD | cannot delete others' resources |
| viewer  | read-only | cannot create/update/delete anything |
```

## Section: Known Failure Modes

Populate during the codebase scan with app-specific quirks. The orchestrator's failure-learning step appends new entries here over time.

```markdown
## Known Failure Modes

- **Slow first-load on /dashboard.** Initial dashboard fetch takes ~5s; treat as PASS if < 10s.
- **Stripe 3DS modal in test mode.** When using card 4000 0027 6000 3184, expect the 3DS challenge — click "Complete" within the iframe.
- **Magic-link emails sometimes delayed in AgentMail.** Poll the inbox for up to 60s before marking BLOCKED.
```

Each entry is one paragraph: what happens, why it's not a real failure, what the QA agent should do.
