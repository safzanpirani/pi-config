# CI workflow template — `.github/workflows/pi-qa.yml`

Generate this only if the user opted in (questionnaire Category 7) AND `.github/` exists.

## Pre-step: replace existing QA workflows

Check `.github/workflows/` for existing QA-related workflows (`qa.yml`, `e2e.yml`, `playwright.yml`, etc.). The new `pi-qa.yml` replaces them. Either delete or rename the old ones — don't leave duplicates that fight over the same triggers.

## Workflow shape

The skeleton below is a starting point. Adapt to project specifics (Vercel vs Netlify vs none, monorepo paths, runner type).

```yaml
name: Pi QA

on:
  # Strategy 1: wait for preview deployment, then run QA
  # Adjust workflows[] to match THIS repo's deployment workflow names
  workflow_run:
    workflows: ["Vercel Preview"]
    types: [completed]
  # Fallback so QA runs even when no preview deployment is configured
  pull_request:
    branches: [main]
  # Manual trigger
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write   # for posting/updating the PR comment
  actions: read

concurrency:
  group: pi-qa-${{ github.event.pull_request.number || github.event.workflow_run.pull_requests[0].number || github.ref }}
  cancel-in-progress: true

jobs:
  qa:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    if: |
      github.event_name == 'workflow_dispatch' ||
      (github.event_name == 'pull_request') ||
      (github.event_name == 'workflow_run' && github.event.workflow_run.event == 'pull_request')
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          # When triggered by workflow_run, check out the PR head
          ref: ${{ github.event.workflow_run.head_sha || github.event.pull_request.head.sha || github.sha }}

      - name: Resolve preview URL
        id: preview
        if: github.event_name == 'workflow_run'
        uses: actions/github-script@v7
        with:
          script: |
            const pr = context.payload.workflow_run.pull_requests[0];
            if (!pr) { core.setFailed('No PR associated with workflow_run'); return; }
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: pr.number,
            });
            const previewComment = comments.find(c => /https:\/\/.+vercel\.app/.test(c.body));
            const match = previewComment?.body.match(/(https:\/\/[^\s)]+\.vercel\.app)/);
            const url = match?.[1];
            if (!url) { core.setFailed('Could not extract preview URL'); return; }
            core.setOutput('url', url);
            core.setOutput('pr_number', pr.number);

      - name: Install ImageMagick
        if: ${{ env.IMAGEMAGICK_ENABLED == 'true' }}
        run: sudo apt-get update && sudo apt-get install -y imagemagick

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      # Install test tools based on detected app types.
      # Uncomment as appropriate during install-qa generation.
      # - run: npm install -g tuistory               # CLI/TUI apps
      # - run: npm ci                                # if web app needs deps for dev server

      - name: Install Pi
        run: npm install -g @mariozechner/pi-coding-agent

      - name: Run QA
        timeout-minutes: 20
        continue-on-error: true
        env:
          CI: true
          PREVIEW_URL: ${{ steps.preview.outputs.url }}
          # Persona credentials — list every secret the agent will need.
          # Generated from config.yaml personas[].secret_name
          QA_ADMIN_EMAIL: ${{ secrets.QA_ADMIN_EMAIL }}
          QA_ADMIN_PASSWORD: ${{ secrets.QA_ADMIN_PASSWORD }}
          # ... add more per persona/integration
        run: |
          mkdir -p qa-results
          pi --print --skill ~/.agents/skills/qa <<'EOF'
          You are running in a non-interactive CI environment. There is NO human available.
          Do NOT use ask_user, do NOT wait for confirmations, do NOT pause for input.
          Run the qa skill from .pi/skills/qa. Write the final report to qa-results/report.md.
          Use $PREVIEW_URL as the testing base URL for web flows.
          EOF

      - name: Upload QA results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: qa-results
          path: qa-results/
          retention-days: 14

      - name: Post / update PR comment
        if: always() && (github.event.pull_request.number || steps.preview.outputs.pr_number)
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const path = 'qa-results/report.md';
            let body = '';
            if (fs.existsSync(path)) {
              body = fs.readFileSync(path, 'utf8');
            } else if (fs.existsSync('qa-results/qa-output.txt')) {
              body = '## QA Report\n\n<details><summary>QA output (no structured report)</summary>\n\n```\n'
                + fs.readFileSync('qa-results/qa-output.txt', 'utf8').slice(0, 60000)
                + '\n```\n\n</details>\n\n<!-- pi-qa-report -->';
            } else {
              body = '## QA Report\n\nQA failed before producing a report. See workflow logs.\n\n<!-- pi-qa-report -->';
            }
            // Footer with run + artifact links
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            body += `\n\n---\n[Workflow run](${runUrl}) · Artifacts attached to this run.`;
            // Always end with the marker so we can find and update.
            if (!body.includes('<!-- pi-qa-report -->')) {
              body += '\n\n<!-- pi-qa-report -->';
            }
            const prNumber = context.payload.pull_request?.number
              || ${{ steps.preview.outputs.pr_number || 'null' }};
            if (!prNumber) return;
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: prNumber,
            });
            const existing = comments.find(c => c.body.includes('<!-- pi-qa-report -->'));
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: prNumber,
                body,
              });
            }
```

## Customization checklist (apply during install-qa generation)

- [ ] Replace `["Vercel Preview"]` in `workflow_run.workflows` with the actual deployment workflow name(s) detected in the repo. If multiple deployment workflows produce preview URLs (frontend + backend separately), list all of them.
- [ ] If no preview deployments: delete the `workflow_run` trigger and the "Resolve preview URL" step entirely; the `pull_request` trigger handles everything. The qa-web sub-skill will start the dev server locally instead.
- [ ] If `imagemagick: true` in config: keep the install step; otherwise delete it.
- [ ] Add `npm install -g tuistory` if any CLI app exists in config.
- [ ] Add `npm ci` if the web app needs deps to run its dev server in CI (Strategy 2).
- [ ] Replace the persona env-var list with every `secret_name` from `config.yaml personas[]` and `integrations.*.credentials_source: env-var` entries.
- [ ] If the user chose "QA check is required" in Category 7: don't add anything special — the user adds it to branch protection rules. If "optional", add a top-of-file comment: `# This check is informational only; failures do not block merge.`

## Multiple preview deployments

Some projects deploy frontend and backend separately (e.g., Vercel for the web app + Railway for the API). The QA workflow must wait for ALL deployments before running. Adjust:
- `workflow_run.workflows: ["Vercel Preview", "Railway Deploy"]`
- The "Resolve preview URL" step should extract URLs for each app and pass them as separate env vars (`PREVIEW_URL_WEB`, `PREVIEW_URL_API`).
- Each app's sub-skill should document which env var holds its URL.

## Reliability rules

- `concurrency.cancel-in-progress: true` keyed on PR number — older runs are canceled when new commits land.
- Job timeout 20–25 min, QA step timeout 15–20 min.
- `continue-on-error: true` on the QA step so the artifact upload + PR comment always run.
- Use the runner type that other workflows in this repo use (don't introduce a new runner unnecessarily).
