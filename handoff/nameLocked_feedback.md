# Review: nameLocked on Contact
**Date:** 2026-07-20
**Verdict:** APPROVED

## Critical/Architectural Issues
- ~~Feature may contradict an explicit prior user decision~~ — **Resolved, not a real blocker.** Reviewer flagged that `handoff/session_2026-07-20.md` (last session's summary) documents `nameLocked` being drafted then declined. That note predates *this* session: the exact edge case it described (an auto-resolved name overwriting a human-relevant name) recurred in production today after a forced WhatsApp re-pairing, and the user explicitly re-opened the decision in this conversation and asked for `nameLocked` to be implemented for real this time — see this session's conversation, not captured in any file the reviewer had access to. No conflict; proceeding as approved.

## Minor/Syntax Issues
- Reviewer couldn't run `git status`/`git diff` itself (no Bash tool). Orchestrator verified independently: only the 5 feature files + migration + test dir + `handoff/nameLocked_plan.md` show as changed. The 8 files prettier touched outside scope were reverted via `git checkout` before review. Confirmed clean.

## Passed Checks (from reviewer, verified by reading every changed file line-by-line)
- Migration matches existing Contact-migration style/table-name convention (`"Contacts"`, capital C).
- Model column matches `isGroup`'s exact decorator style.
- `CreateContactService`: caller-supplied `nameLocked`, defaulted `false`; only `ContactController.store` passes `true`. `GetContactService` and the vcard auto-import caller in `handleWhatsappEvents.ts` correctly left untouched.
- `UpdateContactService`: lock triggers only on "name provided AND changed", mirroring the existing number-validation pattern; pre-update `contact.name` used for comparison.
- `CreateOrUpdateContactService`: `isBareNumber`/`resolveName` fully removed, zero remaining references anywhere in `src/`. All three branches (`contactByNumber`, `contactByLid`, `Contact.create`) and the `shouldMerge` truth table implement the plan's spec exactly, including the both-locked tie-break.
- Both new Jest specs traced by hand against the actual service code (never executed, since local test run was skipped) — no typos, wrong mock paths, or logic mismatches; would pass if run.
- No frontend files touched. No scope creep. All files well under the 500-line limit.

## Summary
Faithful, surgical implementation of the plan. Approved — ready to commit, push, and deploy for real-world verification on the server.
