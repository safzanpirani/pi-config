# Orchestrator template — `.pi/skills/qa/SKILL.md`

This is the template the install-qa skill writes to `.pi/skills/qa/SKILL.md`. The orchestrator is **lightweight** — it loads config, scopes to the diff, dispatches to sub-skills, captures evidence, and writes the report. The actual test flows live in sub-skills.

Replace `<ProjectName>` with the project's name. Everything else in the template should remain verbatim unless adapting for an unusual project setup.

````markdown
---
name: qa
description: >
  Run QA tests for <ProjectName>. Analyzes git diff to determine affected apps,
  runs the relevant test flows from per-app sub-skills with multiple personas,
  and produces a structured pass/fail/blocked/inconclusive report with evidence.
  Use when testing PRs, releases, or smoke-testing an environment.
---

# QA Orchestrator

**SCOPE: This skill performs manual / functional QA only — verifying the application actually works by interacting with it as a real user would (browser, TUI, API). Do NOT run or report on CI checks, linting, ESLint, typecheck, unit tests, or any static analysis. Those belong in separate workflows.**

## Step 1 — Load Configuration

Read `.pi/skills/qa/config.yaml` for environment URLs, credentials sources, personas, and app definitions. Cache the parsed config for the rest of the run.

## Step 2 — Determine Target Environment

Use `default_target` from config unless the user specifies a different environment. Respect every restriction listed under `environments.<name>.restrictions` (e.g., `read-only` in production blocks any write action).

**CRITICAL — Vercel/Netlify preview URLs are DEV environments.** Preview URLs serve the branch's frontend code but connect to the same backend, database, Stripe keys, and third-party integrations as the dev environment. Therefore:

- Use **dev flows** when testing a preview URL (Stripe test cards, dev API keys, dev feature flags).
- Do NOT use prod or preprod flows against a preview URL — they will fail because the preview backend doesn't have prod data.
- The orchestrator must treat preview URLs as equivalent to the `dev` environment in `config.yaml`.

## Step 3 — Analyze Git Diff

Run `git diff` (or `git diff <base>...HEAD` for PRs) to determine what changed. Map every changed file to an app using `apps.<app>.path_patterns` in config.yaml.

Files that don't match ANY app's `path_patterns` (e.g., `.pi/skills/**`, `docs/**`, `.github/**`, repo-level config files) are NOT associated with any app. Do NOT run app test flows for them.

For each affected app:
- Run ONLY that app's flows from its sub-skill
- Generate ADDITIONAL targeted tests based on the specific changes in the diff

For apps NOT affected by the diff:
- Do NOT load or run their sub-skill. Do NOT run their flows. Do NOT run their pre-flight checks. They are completely out of scope.
- Do NOT test CLI if only web files changed. Do NOT test backend if only CLI files changed. The diff determines scope, period.

If NO app is affected, report as **INCONCLUSIVE**: "No app code changed — QA not applicable for this diff." Do NOT run any app flows.

## Step 4 — Pre-flight Checks (app-specific only)

Run pre-flight checks ONLY for apps that ARE affected by the diff. Examples:
- AgentMail / email API check — only if a web app with signup/login flows is affected.
- CLI binary build — only if the CLI app is affected.

**Web app testing on a PR branch:** the agent MUST test against the actual branch code, not whatever is deployed to dev/staging. Use one of the two strategies below (the install-qa skill detects which applies and bakes it into `qa-web/SKILL.md`):

**Strategy 1 (preferred): Vercel/Netlify preview deployments.** If the repo has a workflow that deploys preview URLs on PRs:
1. Wait for the deployment workflow to complete.
2. Extract the preview URL from the PR comment (or env var passed by the QA workflow).
3. Use that URL as the base for all browser tests.

**Strategy 2 (fallback): Local dev server.** If no preview deployment is available:
1. Start the dev server from the checked-out branch in the background.
2. Wait for it to be ready (poll until it responds).
3. Test against `localhost:<port>`.

If a pre-flight check fails for an affected app, report it as **BLOCKED** with the specific error and remediation steps — but still proceed with other affected apps.

## Step 5 — Execute Diff-Relevant Flows Only

For each affected app, read its sub-skill from `.pi/skills/qa-<app-name>/SKILL.md`.

The sub-skill contains a **menu of available test flows**. You must:
1. Read the diff carefully and identify which flows are relevant to the change.
2. Run those flows PLUS any adjacent flows that verify the change integrates correctly.
3. Do NOT run completely unrelated flows.
4. If no existing flow covers the change, write a NEW ad-hoc test that directly verifies the changed behavior.
5. Do NOT run unit tests, lint, typecheck, or any automated test suite. This is **manual / functional QA**.

## Step 6 — Evidence Capture

After each significant test step, capture evidence. Use **text snapshots as primary evidence** — they're greppable, diffable, and don't need image hosting.

For CLI / TUI apps (`tuistory`):
- `tuistory -s <session> snapshot --trim` to capture terminal state as text.
- Embed snapshots directly in the report as fenced code blocks.
- Each snapshot MUST show something DIFFERENT — don't pad with redundant captures.

For web apps (`agent-browser`):
- `agent-browser snapshot` to capture the page's accessibility tree as text evidence.
- Save screenshots to `./qa-results/$RUN_ID/` for the artifact upload.
- Do NOT embed `![image](url)` markdown in the report — the image won't render in PR comments without external hosting.

Evidence quality rules:
- Focus on the RELEVANT content. Trim snapshots to the meaningful section.
- Label each snapshot clearly: what it shows and why it matters.
- NEVER embed broken image links.

## Step 7 — Test Quality Gate

Before finalizing the report, audit your own test selection:

1. **Change-specific first.** At least half your tests should exercise the new/changed feature.
2. **Integration tests are valid.** Tests that verify the change integrates correctly are good.
3. **No unrelated flows.** Do NOT test features completely unrelated to the diff.
4. **No automated test suites.** Do NOT run jest, vitest, npm test, or CI checks.
5. **Negative tests.** Include at least 1 test verifying error handling or boundary conditions.
6. **Interactive testing.** Test by actually interacting with the app as a real user would — no mocking, no shortcuts.
7. **Inconclusive if unsure.** If you cannot articulate what the PR changes, mark as INCONCLUSIVE rather than PASS.

## Step 8 — Handle Failures

**Never silently skip a flow.** If a flow cannot complete, report it as BLOCKED with what was tried and how the user can fix it. Then continue to the next flow.

If `failure_learning` in config is `auto_commit` or `open_pr`, propose updates to the relevant sub-skill's "Known Failure Modes" section after each genuinely-new failure.

## Step 9 — Generate Report

Write the report to `./qa-results/<RUN_ID>/report.md` using `.pi/skills/qa/REPORT-TEMPLATE.md`.

The report MUST follow the template. Key rules:
- Start with `## QA Report` heading immediately followed by the test results table.
- Result column MUST use emoji markers: ✅ PASS, ❌ FAIL, 🚫 BLOCKED, ⚠️ FLAKY, ❓ INCONCLUSIVE.
- Keep it CONCISE. Table + a short "Action Required" section (only if any) + collapsed evidence block = the entire report.
- Do NOT include: "Behavioral Change Summary" prose, "Blocked Flows" prose, "Info" metadata table, or verbose explanations.
- Do NOT report setup or prerequisite steps as test rows.
- Put ALL evidence in a single collapsed `<details>` block.
- For TUI evidence: embed text snapshots as labeled fenced code blocks.
- For web evidence: embed accessibility-tree snapshots as text. Reference screenshot filenames for visual proof; don't embed inline images.
````
