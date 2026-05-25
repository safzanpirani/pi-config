---
description: Safety review for Supabase/Postgres bulk updates before execution
argument-hint: "<table> [environment] [goal]"
---
I am about to run a database change. Treat this as production-risk work unless I explicitly say otherwise.

Context / arguments:
```text
$ARGUMENTS
```

Your job:
1. Identify the target environment, table(s), and intended change.
2. Refuse to proceed if the environment or target table is ambiguous.
3. Inspect the SQL/data I provide and classify risk: LOW / MEDIUM / HIGH.
4. Produce a safe execution plan with:
   - preflight `SELECT` to preview exact affected rows
   - expected affected row count
   - backup query or rollback snapshot strategy
   - transactional update SQL when possible
   - post-update verification query
   - rollback SQL if feasible
5. Check for common hazards:
   - missing or broad `WHERE`
   - IDs copied from CSV with duplicates/malformed values
   - updating more columns than requested
   - null handling mistakes
   - JSONB path mistakes
   - timezone mistakes
   - production vs staging URL/env mismatch
   - RLS/service-role implications
   - triggers/functions with side effects
6. If a CSV/list is involved:
   - count input rows
   - dedupe IDs
   - report invalid IDs
   - show sample mappings
   - ensure only requested columns are changed
7. Default to dry-run. Do not execute destructive SQL unless I explicitly ask you to execute after seeing the preflight plan.

Output format:

```markdown
## Verdict
SAFE / NEEDS CHANGES / DO NOT RUN

## Risk level
LOW / MEDIUM / HIGH — one sentence why.

## What will change
- table:
- columns:
- rows expected:
- environment:

## Preflight queries
```sql
-- exact preview
```

## Backup / rollback plan
```sql
-- backup or rollback SQL
```

## Proposed update
```sql
-- transactional update SQL
```

## Verification
```sql
-- post-update checks
```

## Questions / blockers
- Only list true blockers.
```
