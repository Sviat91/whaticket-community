# Review: WppKey deadlock retry
**Date:** 2026-07-28
**Verdict:** APPROVED

## Critical/Architectural Issues
(none)

## Minor/Syntax Issues
- [x] FIXED: catch block's `logger.error(...)` had no `return`/`break`, causing fall-through retry on non-deadlock errors. Coder added `return;` after the log call.

## Passed Checks
- [x] Retry loop only retries on `ER_LOCK_DEADLOCK` (checks both `err.original?.code` and `err.parent?.code`), all other errors fail fast
- [x] Bounded to MAX_ATTEMPTS = 3, no infinite loop possible
- [x] Three exit paths are exhaustive and correct: success → `return`, deadlock retry with attempts remaining → `continue`, terminal failure (deadlock exhausted or non-deadlock error) → log + `return`
- [x] Redis branch, function signature, and imports unchanged — matches plan's "no other changes" constraint
- [x] `npx tsc --noEmit` passes
- [x] No schema/dependency changes introduced

## Summary
The previously flagged issue (fall-through retry on non-deadlock errors) is resolved by the added `return;`. The loop now has three fully exhaustive, correctly separated exit paths, matching the plan's intent. No unrelated code touched. Approved.
