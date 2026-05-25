#!/usr/bin/env bash
# install-qa Phase 2 first-pass codebase detection.
#
# Emits a Markdown summary the agent can verify and extend with model reasoning.
# This is a HINT, not authoritative — the SKILL.md still owns final detection.
#
# Usage:  bash scripts/detect.sh [repo-root]
# Default repo-root is $PWD.

set -u

ROOT="${1:-$PWD}"
cd "$ROOT" || { echo "ERR: cannot cd to $ROOT" >&2; exit 1; }

emit() { printf '%s\n' "$*"; }

# ─── Header ────────────────────────────────────────────────────────────────
emit "# install-qa detection summary"
emit ""
emit "_Repo: \`$ROOT\`_"
emit "_Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)_"
emit ""

# ─── Repo basics ───────────────────────────────────────────────────────────
emit "## Repo basics"
if git rev-parse --git-dir >/dev/null 2>&1; then
  emit "- git repo: yes"
  emit "- branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  emit "- remote: $(git remote get-url origin 2>/dev/null || echo none)"
else
  emit "- git repo: no"
fi
emit ""

# ─── Monorepo / workspaces ─────────────────────────────────────────────────
emit "## App structure"
WORKSPACE_HINT=""
if [ -f package.json ]; then
  if grep -q '"workspaces"' package.json 2>/dev/null; then
    WORKSPACE_HINT="npm/yarn/pnpm workspaces"
  fi
fi
[ -f pnpm-workspace.yaml ] && WORKSPACE_HINT="pnpm-workspace.yaml"
[ -f turbo.json ] && WORKSPACE_HINT="turborepo (turbo.json)"
[ -f nx.json ] && WORKSPACE_HINT="nx (nx.json)"
[ -f lerna.json ] && WORKSPACE_HINT="lerna (lerna.json)"

if [ -n "$WORKSPACE_HINT" ]; then
  emit "- monorepo signal: \`$WORKSPACE_HINT\`"
else
  emit "- monorepo signal: none detected"
fi

# Top-level dirs that often hold apps
for d in apps packages services functions; do
  if [ -d "$d" ]; then
    emit "- \`$d/\`:"
    ls -1 "$d" 2>/dev/null | head -20 | sed 's/^/  - /'
  fi
done
emit ""

# ─── Tech stack ────────────────────────────────────────────────────────────
emit "## Tech stack signals"
[ -f package.json ]   && emit "- node: \`package.json\` present"
[ -f Cargo.toml ]     && emit "- rust: \`Cargo.toml\` present"
[ -f go.mod ]         && emit "- go: \`go.mod\` present"
[ -f pyproject.toml ] && emit "- python: \`pyproject.toml\` present"
[ -f requirements.txt ] && emit "- python: \`requirements.txt\` present"
[ -f Gemfile ]        && emit "- ruby: \`Gemfile\` present"
[ -f composer.json ]  && emit "- php: \`composer.json\` present"
[ -f deno.json ] || [ -f deno.jsonc ] && emit "- deno: deno config present"
[ -f bun.lock ] || [ -f bun.lockb ] && emit "- bun: lockfile present"

# Frameworks (best-effort grep)
if [ -f package.json ]; then
  emit ""
  emit "### package.json highlights"
  for key in next react vue svelte solid astro nuxt remix vite express fastify nestjs koa hono; do
    if grep -q "\"$key\":" package.json; then
      emit "- dep: \`$key\`"
    fi
  done
  emit ""
  emit "### scripts"
  if command -v jq >/dev/null 2>&1; then
    jq -r '.scripts // {} | to_entries | map("- `\(.key)`: `\(.value)`") | .[]' package.json 2>/dev/null
  else
    grep -A 50 '"scripts"' package.json | head -40 | sed 's/^/    /'
  fi
fi
emit ""

# ─── Auth / providers (dependency grep) ────────────────────────────────────
emit "## Auth signals"
if [ -f package.json ]; then
  for lib in next-auth @clerk/nextjs @clerk/clerk-sdk-node @workos-inc/node @auth0/nextjs-auth0 firebase-admin passport @supabase/supabase-js lucia-auth iron-session; do
    if grep -q "\"$lib\":" package.json; then
      emit "- dep: \`$lib\`"
    fi
  done
fi
emit ""

# ─── Environments / .env files ─────────────────────────────────────────────
emit "## Environment files"
for f in .env .env.example .env.local .env.development .env.staging .env.production .env.test; do
  if [ -f "$f" ]; then
    line_count=$(wc -l < "$f" | tr -d ' ')
    emit "- \`$f\` (lines: $line_count)"
  fi
done
emit ""

# ─── External integrations ─────────────────────────────────────────────────
emit "## External integration signals"
if [ -f package.json ]; then
  for lib in stripe @stripe/stripe-js braintree @paypal/checkout-server-sdk \
             @sendgrid/mail @aws-sdk/client-ses postmark resend nodemailer agentmail \
             twilio messagebird \
             launchdarkly-node-server-sdk @launchdarkly/node-server-sdk statsig-node @statsig/statsig-node-core unleash-client @growthbook/growthbook flagsmith @splitsoftware/splitio \
             @sentry/node @sentry/nextjs @datadog/browser-rum posthog-node mixpanel; do
    if grep -q "\"$lib\":" package.json; then
      emit "- dep: \`$lib\`"
    fi
  done
fi
emit ""

# ─── CI / CD ───────────────────────────────────────────────────────────────
emit "## CI / CD"
if [ -d .github/workflows ]; then
  emit "- provider: GitHub Actions"
  emit "- workflows:"
  ls -1 .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null | sed 's|^|  - |'
elif [ -f .gitlab-ci.yml ]; then
  emit "- provider: GitLab CI"
elif [ -f Jenkinsfile ]; then
  emit "- provider: Jenkins"
elif [ -d .circleci ]; then
  emit "- provider: CircleCI"
else
  emit "- provider: none detected"
fi
emit ""

# Vercel / Netlify
[ -f vercel.json ]  && emit "- vercel.json present (preview deployments likely)"
[ -f netlify.toml ] && emit "- netlify.toml present (preview deployments likely)"
emit ""

# ─── Existing test infra ───────────────────────────────────────────────────
emit "## Existing test infrastructure"
if [ -f package.json ]; then
  for lib in jest vitest mocha @playwright/test cypress @testing-library/dom @testing-library/react webdriverio; do
    if grep -q "\"$lib\":" package.json; then
      emit "- dep: \`$lib\`"
    fi
  done
fi
[ -f pytest.ini ] || [ -f pyproject.toml ] && grep -q '\[tool.pytest' pyproject.toml 2>/dev/null && emit "- python: pytest configured"
emit ""

# ─── Diff scope (only if PR-style invocation) ──────────────────────────────
emit "## Recent change scope"
if git rev-parse --git-dir >/dev/null 2>&1; then
  CHANGED=$(git diff --name-only HEAD 2>/dev/null | head -30)
  if [ -n "$CHANGED" ]; then
    emit "Files changed vs HEAD:"
    echo "$CHANGED" | sed 's/^/- /'
  else
    emit "- no uncommitted changes"
  fi
fi
emit ""

emit "---"
emit "_Verify these signals against the actual codebase before committing config.yaml._"
