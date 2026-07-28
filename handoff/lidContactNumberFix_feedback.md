# Review: LID contact number fix
**Date:** 2026-07-28
**Verdict:** APPROVED

## Critical/Architectural Issues
(none)

## Minor/Syntax Issues
- No dedicated unit test for `BuildChatId.ts`'s "bare lid without @lid suffix" branch — only indirectly exercised. Not a blocker, correct code path.
- `number: number || undefined` relying on Sequelize turning `undefined` into SQL NULL — confirmed by-design Sequelize v5 behavior (traced into `sql-string.js`), but final confirmation deferred to the CI/server test run (no local MySQL per project convention). Not a defect, just flag to actually run that test before considering this fully verified.

## Passed Checks
- [x] `nameLocked` untouched anywhere in the diff — double-confirmed via `git diff | grep "^[+-].*nameLocked"` (zero matches).
- [x] `BuildChatId.ts` correct for both real-number and LID-only contacts, no double `@lid` suffixing.
- [x] `whaileys.ts:677-680` fallback no longer donates LID digits as `number`.
- [x] `ShowTicketService.ts` only adds `"lid"` to attributes, nothing else touched.
- [x] Critical prerequisite verified end-to-end: `MessageController.store` → `ShowTicketService` (now includes `lid`) → `BuildChatId`.
- [x] All other send/delete/read-receipt call sites (`SendWhatsAppMessage`, `SendWhatsAppMedia`, `DeleteWhatsAppMessage`, `SetTicketMessagesAsRead`, `handleQueueLogic`) correctly wired.
- [x] Untouched-by-design files confirmed still untouched: `wwebjs.ts`, `normalizeJid`, `SerializeWbotMsgId.ts`, group-contact branch, `checkExternallyReadTickets`, `GetWppSessionKeys.ts`/`StoreWppSessionKeys.ts`, `CreateContactService.ts`.
- [x] Repair migration idempotent, correctly scoped, no-op `down` as planned.
- [x] New regression test actually exercises the UNIQUE-index guard (two distinct LID-only contacts, empty number, no collision).
- [x] `npm run build` (tsc) passes, no new errors.

## Summary
Implementation matches the plan at every call site, including both traps the plan flagged as make-or-break (ShowTicketService's `lid` attribute, NULL-vs-empty-string normalization). Zero `nameLocked` changes, confirmed twice. No changes required before merge. Recommend running the test suite in CI and following the plan's post-deploy verification checklist against the real "Cargo 2" and "Vasil" contacts.
