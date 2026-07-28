# Review: tcTokenLidFallback
**Date:** 2026-07-28
**Verdict:** APPROVED

## Critical/Architectural Issues
(none)

## Minor/Syntax Issues
(none)

## Passed Checks
- [x] Fallback only executes when the first exact-match lookup returned nothing — a genuine hit is never overridden.
- [x] Result stored under the originally-requested `id`, never under `altId` — matches whaileys' lookup-by-original-id contract.
- [x] Fallback strictly scoped to `type === "contacts-tc-token"`; all other key types unaffected (session/sender-keys/sender-key-memory go through the earlier Redis branch entirely; other MySQL types skip the new `if`).
- [x] `swapJidSuffix` returns `null` for ids with neither suffix, no thrown exceptions.
- [x] Redis branch, function signature, imports, export, and try/catch structure untouched.
- [x] Second `findOne` awaited inside the same try block — no masking of DB errors, no unhandled rejection risk.
- [x] `npx tsc --noEmit` passes.

## Summary
Implementation matches the plan exactly. Fallback is correctly gated, preserves the original lookup key for the result, leaves every other key type and the Redis path untouched, and introduces no new error-handling risk. No issues found.
