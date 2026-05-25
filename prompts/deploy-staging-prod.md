---
description: Commit selected files to staging and cherry-pick the exact commit to prod/main
argument-hint: "<target: prod|main> <commit message ending --deploy> <files...>"
---
Deploy the current repo change using the global helper script.

Requirements:
- Use this only when the user explicitly asks to deploy staging + prod/main.
- Run build/tests first if not already done for this change.
- Do not include unrelated local changes.
- Arguments must include:
  1. target branch: `prod` for frontend repos, `main` for backend repos where main is production
  2. full commit message, ending with `--deploy`
  3. explicit files/directories to include in the commit
- Remaining arguments after the commit message are explicit files/directories to include in the commit.
- If arguments are missing, ask for the target, commit message, and exact file list.

Branch conventions for SignalAI:
- `gritflow-assess` frontend: deploy `staging` then `prod`
- `signal-ai-backend` backend: deploy `staging` then `main` (`main` is production)

Command patterns:

```bash
# Frontends / repos where prod is the production branch
deploy-staging-prod "$2" ${@:3}

# Backends / repos where main is the production branch
deploy-staging-main "$2" ${@:3}
```

Equivalent backend form:

```bash
deploy-staging-prod --target main "$2" ${@:3}
```

If the user gives a combined deployment request involving both frontend and backend:
- Run the frontend command from the frontend repo on `staging` targeting `prod`.
- Run the backend command from the backend repo on `staging` targeting `main`.
- Use explicit file lists for each repo.

User arguments:

```text
$ARGUMENTS
```
