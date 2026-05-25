---
name: install-qa
description: Set up project-specific automated functional QA. Generates a Pi skill at .pi/skills/qa/ (orchestrator + per-app sub-skills + config.yaml + report template) plus an optional GitHub Actions workflow that runs QA on PRs. Use when the user wants automated PR/release/smoke QA that scopes tests to the git diff, runs per-persona browser/CLI/API checks, captures evidence, and produces a structured pass/fail/blocked/inconclusive report. Pi-native port of Factory droid's /install-qa.
---

# Install QA Skill

Generate a Pi-native automated QA system for the current repo. The output is a project-local Pi skill at `.pi/skills/qa/` that the user invokes later via `/skill:qa` (or that runs in CI on every PR if a workflow is generated).

This skill performs **manual / functional QA only** — verifying the app actually works by interacting with it as a real user would (browser, TUI, API). It does NOT run unit tests, lint, typecheck, or any CI static analysis. The generated artifacts must enforce the same scope.

## Output layout

```
.pi/skills/qa/
  SKILL.md                    # orchestrator — reads diff, dispatches to sub-skills
  config.yaml                 # single source of truth (envs, personas, apps, integrations, cleanup)
  REPORT-TEMPLATE.md          # standardized PR-comment-friendly report
  .install-progress.yaml      # questionnaire progress (allows resume)
.pi/skills/qa-<app-name>/
  SKILL.md                    # one per testable app — qa-web, qa-cli, qa-api, ...
.github/workflows/pi-qa.yml   # only if user opts in
```

Sub-skills MUST be named `qa-<app-name>` so the orchestrator can load them and the user can invoke them individually via `/skill:qa-web` etc.

## Phase 1 — Resume vs Fresh

If `.pi/skills/qa/.install-progress.yaml` exists:
1. Read it. Show the user a summary of previously-saved answers.
2. Ask: "Resume with these as defaults, or start fresh?"
   - **Resume**: re-ask every category but pre-fill prior answers as defaults. Regenerate ALL files from scratch.
   - **Fresh**: delete `.install-progress.yaml`, then proceed to Phase 2.

Always regenerate every file from final answers. Never patch incrementally.

## Phase 2 — Codebase Analysis (auto-detect, no questions yet)

Scan the repo and detect each item below WITHOUT asking the user. Present findings as a structured Markdown summary at the end.

You MAY use `scripts/detect.sh` from this skill as a fast first-pass — it emits a JSON-ish summary of the obvious facts (package.json scripts, env files, integrations, CI provider, test frameworks). Treat its output as a hint; verify and extend with model reasoning.

Detect:
- **App structure**: monorepo? what apps exist? path patterns per app? (`package.json` workspaces, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `Cargo.toml` workspace, `pyproject.toml`, top-level dirs like `apps/`, `packages/`, `services/`)
- **Tech stack per app**: framework, language, package manager, build/dev/test commands
- **Authentication**: provider/library (NextAuth, Clerk, WorkOS, Auth0, Firebase, Passport, Supabase Auth, custom). Method (OAuth, magic link, OTP, email-pw, SAML, API key)
- **Environments**: URLs for dev/staging/prod from `.env*`, deployment manifests, CI workflows, README
- **Feature flags**: provider (LaunchDarkly, Statsig, Unleash, Split, GrowthBook, Flagsmith, custom) — `package.json` deps + import grep
- **External integrations**: payments (Stripe, Braintree, PayPal), email (SendGrid, SES, Postmark, Resend, AgentMail, Mailhog), SMS (Twilio, MessageBird), other SaaS SDKs
- **CI/CD**: provider (`.github/workflows`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci`), existing QA/E2E workflows
- **Test infrastructure**: frameworks (Jest, Vitest, Playwright, Cypress, pytest, etc.), existing E2E suites
- **Critical user flows**: from route definitions, page components, API endpoints, form submissions
- **Preview deployments**: Vercel/Netlify? extracted preview URLs from PR comments? — informs the orchestrator's testing strategy

Present findings as a structured Markdown summary BEFORE asking any Phase 3 questions.

## Phase 3 — Questionnaire (ask only what wasn't auto-detected)

Walk the categories in `references/questionnaire.md` one at a time. After each category is answered, append the answers to `.pi/skills/qa/.install-progress.yaml` so the user can resume if interrupted.

Categories (8):
1. Default QA target environment + restrictions
2. Personas & roles (with negative-test capabilities)
3. Critical flows (confirm + extend the auto-detected list)
4. External services (only if detected)
5. Cleanup strategy
6. ImageMagick (for animated screenshot diffs — optional)
7. GitHub Actions workflow (only if `.github/` exists)
8. Failure learning mode (suggest_in_report / auto_commit / open_pr)

Use `ask_user` if available. Otherwise list the exact missing inputs needed and let the user reply free-form.

## Phase 4 — Generate Files

Using the final answers + Phase 2 findings, generate every file from scratch (overwrite if they exist):

| File | Template reference |
|------|--------------------|
| `.pi/skills/qa/config.yaml` | `references/config-schema.md` |
| `.pi/skills/qa/SKILL.md` | `references/orchestrator-template.md` |
| `.pi/skills/qa/REPORT-TEMPLATE.md` | `references/report-template.md` |
| `.pi/skills/qa-<app-name>/SKILL.md` (per detected app) | `references/subskill-template.md` |
| `.github/workflows/pi-qa.yml` (only if user opted in) | `references/ci-workflow.md` |

Naming rule: sub-skills MUST be `qa-<app-name>` so the orchestrator can load them.

When templates conflict with reality (custom test runner, unusual auth, monorepo quirks): adapt the template — don't force the project into its mold.

## Phase 5 — Verification

After generating files:
1. Show a summary of every file created with a one-line description.
2. Tell the user: "Run `/skill:qa` to invoke QA, or open a PR to trigger the workflow (if generated)."
3. If a CI workflow was generated, list the EXACT GitHub secrets it needs as a checklist (derive from `config.yaml` `credentials_source` fields and detected integrations):
   ```
   The QA workflow needs these GitHub repository secrets:
     [ ] <NAME> — what it's for. Get it from: <where>.
   ```
   Plus link: `https://github.com/<owner>/<repo>/settings/secrets/actions`
4. Remind about manual setup: test accounts, API access, environment allowlists, ImageMagick install (if user opted in but it isn't installed yet).

## Hard rules

- **Never** store actual credentials, passwords, API keys, or tokens in any generated file. Only references to env var names or secret manager keys.
- The orchestrator `.pi/skills/qa/SKILL.md` must stay LIGHTWEIGHT. Test flow details live in sub-skills.
- Save progress after EVERY questionnaire category. If the user says "start over", delete `.install-progress.yaml` and restart from Phase 2.
- Always regenerate every file from final answers — even if they already exist. Overwrite them.
- **Preview URLs from Vercel/Netlify behave like the dev environment** (same backend, same DB, same Stripe keys). The orchestrator and sub-skills must use dev-environment flows when testing against a preview URL — never prod/preprod flows.
- The generated orchestrator and sub-skills MUST forbid running unit tests, lint, typecheck, or any static analysis. This is **manual/functional QA** only.
- When testing a PR branch, the agent MUST test the actual branch code — either via Vercel/Netlify preview URL OR by starting the dev server locally from the checked-out branch. NEVER fall back to a remote dev/staging URL when verifying a PR branch.

## Pi-specific notes

- The generated `qa-web` sub-skill should reference the `agent-browser` Pi skill for browser automation (already installed at `~/.agents/skills/agent-browser`).
- For CLI/TUI apps: reference `tuistory` (and the `droid-control` skill if installed). If not present, document the install command in the sub-skill's setup section.
- The orchestrator should be model-driven: read the diff, choose flows from each affected sub-skill's menu, run them, capture evidence, generate the report. No DSL.
