# Report template — `.pi/skills/qa/REPORT-TEMPLATE.md`

Generate `.pi/skills/qa/REPORT-TEMPLATE.md` with this exact content. The orchestrator (Step 9) substitutes the placeholders at run time.

````markdown
## QA Report

| # | Test Case | App | Persona | Result | Notes |
|---|-----------|-----|---------|--------|-------|
{{TEST_ROWS}}

Result values: ✅ PASS · ❌ FAIL · 🚫 BLOCKED · ⚠️ FLAKY · ❓ INCONCLUSIVE

{{#if ACTIONABLE_ITEMS}}
### Action Required

{{ACTIONABLE_ITEMS}}
{{/if}}

<details>
<summary>Screenshots & Evidence</summary>

{{EVIDENCE}}

</details>

<!-- pi-qa-report -->
````

## Placeholder rules

- `{{TEST_ROWS}}` — one row per test case. Each row is `| N | <case-name> | <app> | <persona> | <emoji> <STATUS> | <one-line-note> |`. Don't include setup or pre-flight steps as rows.
- `{{ACTIONABLE_ITEMS}}` — bulleted list of things the user must do to fix failures or unblock blocked flows. Omit the entire `### Action Required` section if there are no actionable items.
- `{{EVIDENCE}}` — labeled subsections. For each test case that captured evidence, include a header like `**Test 3 — login flow**` followed by the relevant snapshot (fenced code block for terminal/accessibility tree, or `Screenshot: qa-results/$RUN_ID/test-3-login.png` for image references — never inline `![]()` markdown).
- `<!-- pi-qa-report -->` — hidden HTML marker used by the CI workflow to find and update the existing PR comment instead of posting a new one. Always include it.

## Status semantics

| Emoji | Status | When to use |
|-------|--------|-------------|
| ✅ | PASS | Flow ran, every success criterion met |
| ❌ | FAIL | Flow ran, at least one criterion failed |
| 🚫 | BLOCKED | Flow couldn't run (pre-flight failure, missing credentials, broken dep) |
| ⚠️ | FLAKY | Flow passed on retry but failed initially — note the retry count |
| ❓ | INCONCLUSIVE | Cannot determine if the change behaves correctly (e.g., diff is config-only, or the agent can't articulate what the PR does) |

## Don'ts

- Don't include a "Behavioral Change Summary" prose block.
- Don't include a "Blocked Flows" prose section — BLOCKED rows in the table are enough.
- Don't include an "Info" metadata table (run ID, commit SHA, env). The CI workflow appends those in a footer outside this template.
- Don't report setup/prerequisite steps as test rows.
- Don't embed inline images (`![](url)`) — they don't render reliably in PR comments. Reference filenames instead.
