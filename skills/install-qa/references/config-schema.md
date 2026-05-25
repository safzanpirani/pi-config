# `config.yaml` schema

Generate `.pi/skills/qa/config.yaml` with this structure. Replace placeholders with actual values from Phase 2 findings + Phase 3 answers. Comments help future readers — keep them.

```yaml
# .pi/skills/qa/config.yaml
# Single source of truth for the QA skill. Modify here, not in SKILL.md files.

project: <ProjectName>
imagemagick: <true|false>           # Set true to enable animated GIF diffs of screenshots

# ─── Environments ────────────────────────────────────────────────────────────
# Vercel/Netlify preview URLs behave like `dev` — same backend/DB/keys.
# When testing a PR's preview URL, treat it as the dev environment.
environments:
  dev:
    url: <url-or-localhost-port>
    restrictions: []
  staging:
    url: <url-or-null>
    restrictions: []
  production:
    url: <url-or-null>
    restrictions: [read-only]       # Common: never write in prod

default_target: <env-name>          # Where /skill:qa runs by default

# ─── Auth ────────────────────────────────────────────────────────────────────
auth:
  method: <otp|oauth|email-password|magic-link|api-key|saml|none>
  provider: <WorkOS|Auth0|Clerk|Firebase|NextAuth|Supabase|custom|none>
  notes: |
    Anything special about how login works that the agent needs to know.
    e.g., "OAuth via Google only", "magic link arrives at AgentMail inbox",
    "API key passed in X-Api-Key header".

# ─── Personas ────────────────────────────────────────────────────────────────
# Each persona drives a different test path. Always include a synthetic
# `new_user` persona for fresh-signup / empty-state tests.
personas:
  - name: <role-name>               # e.g., admin, member, viewer
    description: "<what this user type does>"
    email: <test-account-email>
    credentials_source: <aws-secrets-manager|env-var|vault|1password|manual>
    secret_name: <SECRET_KEY_OR_ENV_VAR_NAME>
    test_focus: [<areas to exercise as this persona>]
    cannot_do: [<things this persona must NOT be able to do — drives negative tests>]
  - name: new_user
    description: "Fresh signup, no existing data"
    email_pattern: "qa+signup_{RUN_ID}@<your-domain>"
    test_focus: [onboarding, empty-states, first-run-experience]

# ─── Apps ────────────────────────────────────────────────────────────────────
# One entry per testable app. The orchestrator maps changed files → app via
# path_patterns, then runs only that app's sub-skill.
apps:
  <app-name>:
    path_patterns: [<glob>, <glob>]    # Files matching these belong to this app
    skill: qa-<app-name>               # Sub-skill name — MUST start with `qa-`
    test_tool: <agent-browser|tuistory|curl|manual>
    build_command: "<optional build command>"
    start_command: "<optional dev-server start command>"
    start_url: "<optional URL to wait for, e.g., http://localhost:3000>"

# ─── Feature Flags ───────────────────────────────────────────────────────────
feature_flags:
  provider: <LaunchDarkly|Statsig|Unleash|Split|GrowthBook|Flagsmith|custom|none>
  dashboard_url: <url-or-null>
  how_to_override: |
    Instructions for forcing a flag value during a test run.
    e.g., "Set query string ?flag_x=true" or "Use the LD test SDK key".

# ─── External Integrations ───────────────────────────────────────────────────
integrations:
  payments:
    provider: <Stripe|Braintree|PayPal|none>
    mode: <test|sandbox|prod>
    test_card: "4242 4242 4242 4242"
  email:
    provider: <AgentMail|SendGrid|SES|Postmark|Resend|Mailhog|none>
    test_inbox: <how-to-receive-test-emails>
  sms:
    provider: <Twilio|MessageBird|none>
    test_number: <e164-format-or-null>
  # ... other integrations follow the same pattern

# ─── Cleanup ─────────────────────────────────────────────────────────────────
cleanup:
  auto_cleanup: <true|false>
  strategy: <delete-via-api|admin-panel|db-reset|manual|none>
  instructions: |
    Step-by-step cleanup that the agent runs after each QA session.
    e.g., "DELETE /api/admin/users/{id} with header X-Admin-Key=$ADMIN_KEY"

# ─── Failure Learning ────────────────────────────────────────────────────────
failure_learning: <suggest_in_report|auto_commit|open_pr>
```

## Validation rules

- `apps.*.skill` MUST equal `qa-<app-name>` (the sub-skill directory name).
- `default_target` MUST be a key in `environments`.
- Every persona MUST have either `email` (real account) or `email_pattern` (synthetic).
- Never put actual passwords/keys/tokens in this file. Only references.
- If `imagemagick: true`, the orchestrator may attempt animated diffs; if false, it falls back to static screenshots.
- If `feature_flags.provider: none`, the orchestrator skips flag-override steps.
