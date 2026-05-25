---
description: Commit selected backend files to staging and cherry-pick exact commit to main
argument-hint: "<commit message ending --deploy> <files...>"
---
Deploy the current backend repo change using the global helper script, where `main` is production.

Requirements:
- Use this only when the user explicitly asks to deploy staging + main, or staging + prod for a backend whose production branch is `main`.
- The first argument is the full commit message and it must end with `--deploy`.
- Remaining arguments are explicit files/directories to include in the commit.
- Do not include unrelated local changes.
- Run build/tests first if not already done for this change.

Command pattern:

```bash
deploy-staging-main "$1" ${@:2}
```

Equivalent:

```bash
deploy-staging-prod --target main "$1" ${@:2}
```

If arguments are missing, ask for the commit message and exact file list.

User arguments:

```text
$ARGUMENTS
```
