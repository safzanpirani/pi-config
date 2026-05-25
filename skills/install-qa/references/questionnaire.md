# Questionnaire — 8 Categories

Walk these in order. After each category, append the answers to `.pi/skills/qa/.install-progress.yaml` so the user can resume if interrupted.

Use `ask_user` per question if available. Otherwise present the prompts as numbered free-form questions and parse the user's reply.

---

## Category 1: Default QA Target

- "I found these environments: [list from Phase 2]. Which should QA run against by default?"
- "Any restrictions on specific environments?" (e.g., "never create real users in prod", "production must be read-only", "staging may create disposable test data")

**Save:** `default_target`, `environments[].restrictions` in progress file.

---

## Category 2: Personas & Roles

Preamble for the user:

> QA needs to test your app as different types of users. This ensures permissions work correctly. Each persona represents a real user type.

For each role, ask:
- (a) Short name (e.g., admin, member, viewer, guest, new_user)
- (b) What they CAN do (key capabilities — drives positive tests)
- (c) What they should NOT be able to do (drives **negative tests**)
- (d) Do you have a dedicated test account for this role? If so, what email/identifier?

Then:
- "For roles without dedicated test accounts, should QA create them via signup during the test run, or will you provide them?"
- "Where are test credentials stored?" — env var name / AWS Secrets Manager key / HashiCorp Vault path / 1Password / "I'll enter manually each run"

**Always include a synthetic `new_user` persona** with `email_pattern: "qa+signup_{RUN_ID}@<domain>"` for fresh-signup / empty-state / first-run tests.

**Save:** `personas[]` with name, description, email/email_pattern, credentials_source, secret_name, test_focus, cannot_do.

---

## Category 3: Critical Flows (confirm + extend)

- "Based on my analysis, these are the critical user flows I identified: [list from Phase 2]. Are these correct? Any to add or remove?"
- For each flow, ask:
  - "Success criteria?" (what does 'pass' look like?)
  - "Should this be tested with multiple personas?" (default no)
  - "Does this create persistent data that needs cleanup?" (default no)

**Save:** `flows[]` with id, app, description, success_criteria, multi_persona, creates_data.

---

## Category 4: External Services (only if detected in Phase 2)

For each detected integration, ask:
- "I see [ServiceName] in your dependencies. Does it have a sandbox/test mode? What test credentials should QA use?"
- For email specifically (only ask if no AgentMail/Mailhog/test SMTP detected): "How should QA receive test emails during signup/notification flows?"

Common follow-ups:
- Stripe: "Use Stripe test mode? Which test card?" (default: 4242 4242 4242 4242)
- Twilio: "Test phone number / receiver?"
- OAuth providers: "Test workspace/tenant?"

**Save:** `integrations.<name>` with provider, mode (sandbox/test/prod), credentials_source.

---

## Category 5: Cleanup

- "After QA creates test users or data, how should it clean up?"

Options:
1. **Delete via API endpoint** (which one? — record path + auth)
2. **Admin panel cleanup** (manual, document the steps)
3. **Database reset command** (record the command — must be safe, never against prod)
4. **Leave for manual cleanup** (with a TTL note in the report)
5. **Not applicable** — tests are read-only

**Save:** `cleanup.strategy`, `cleanup.instructions`.

---

## Category 6: ImageMagick (for screenshot diffs)

1. Check if ImageMagick is installed: `command -v magick || command -v convert`
2. If installed: set `imagemagick: true` in config.yaml. No question needed.
3. If NOT installed, ask: "ImageMagick enables animated GIF diffs of before/after screenshots. Install it?"
   - **Yes**: run `brew install imagemagick` (macOS) or `sudo apt-get install -y imagemagick` (Linux). Set `imagemagick: true`.
   - **No**: set `imagemagick: false`.

**Save:** `imagemagick: <true|false>`.

---

## Category 7: GitHub Action (only if `.github/` directory exists)

1. List any existing QA-related workflows in `.github/workflows/`. Note that the new `pi-qa.yml` will replace them.
2. "Would you like me to generate a GitHub Actions workflow that runs QA automatically on PRs?"

If yes:
- "Should the QA check be **required** (blocks merge if it fails) or **optional** (runs but doesn't block merge)?"
  - Required: no extra config (repo admins add it to branch protection rules).
  - Optional: workflow file gets a comment noting it's informational only.
- If Vercel/Netlify previews were detected: "PRs get a preview deployment. Should the QA workflow wait for it before running tests?" (default: yes)

**Save:** `ci.generate`, `ci.required`, `ci.wait_for_preview`.

---

## Category 8: Failure Learning

- "When QA hits a new failure pattern, how should it feed that back so future runs handle it better?"

Options:
1. **Suggest in report (default)** — QA report includes a "Suggested Skill Updates" section with ready-to-copy markdown snippets.
2. **Auto-commit** — Pi directly commits updates to the sub-skill files after each run. Requires `contents: write` GitHub permission for CI runs.
3. **Open a PR** — Pi opens a PR with the failure catalog updates. Requires `contents: write` and `pull-requests: write`.

**Save:** `failure_learning: <suggest_in_report|auto_commit|open_pr>`.

---

## Progress file shape

`.pi/skills/qa/.install-progress.yaml` should accumulate as:

```yaml
schema_version: 1
last_completed_category: 5
answers:
  category_1:
    default_target: dev
    environments:
      production:
        restrictions: [read-only]
  category_2:
    personas:
      - name: admin
        # ...
  # ...
```

After Phase 4 generates the final files, you MAY leave the progress file in place so future re-runs can resume, OR delete it. Default: leave it.
