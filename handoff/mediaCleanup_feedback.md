# Review: mediaCleanup
**Date:** 2026-07-25
**Verdict:** APPROVED

## Critical/Architectural Issues
(none)

## Minor/Syntax Issues
(none)

## Passed Checks
- [x] Query scoping: `Message.findAll` uses `where: { mediaUrl: { [Op.ne]: null }, createdAt: { [Op.lt]: cutoff } }` with `limit: BATCH_SIZE`, wrapped in a `while (true)` loop that `break`s when `messages.length === 0` — correct batching and termination (CleanupOldMediaService.ts:22-34).
- [x] Raw filename read via `message.getDataValue("mediaUrl")` (bypasses the model's URL-prepending getter, confirmed against `Message.ts:38-40`), joined with `uploadConfig.directory` imported from `../../config/upload` (not re-derived) (CleanupOldMediaService.ts:5,38,43).
- [x] Error isolation: per-file `try/catch` around `fs.promises.unlink` — `ENOENT` is swallowed silently, all other errors go through `logger.error` and the `for` loop continues to the next file regardless (CleanupOldMediaService.ts:40-49).
- [x] `message.update({ mediaUrl: null })` runs unconditionally after the unlink try/catch (success, ENOENT, or other error), so the DB never retains a dangling reference (CleanupOldMediaService.ts:52).
- [x] `await delay(BATCH_PAUSE_MS)` runs once per batch (outside the per-file `for` loop, inside the `while`), giving a real 500ms pause between batches of up to 200 files — meaningfully throttles a large backlog without per-file overhead, and the loop is bounded by decreasing DB rows so it cannot run forever or pile up unbounded promises (each batch is fully awaited before the next fetch).
- [x] Top-level `try/catch` wraps the entire function body and only logs via `logger.error` on failure — the function can never reject/throw, safe to invoke bare from `setInterval` with no `.catch()` in server.ts (CleanupOldMediaService.ts:16-65).
- [x] `server.ts` placement: `CleanupOldMediaService()` and `setInterval(CleanupOldMediaService, 24h)` are added after `StartAllWhatsAppsSessions();`, both calls fire-and-forget (neither awaited). Since `StartAllWhatsAppsSessions` is also `async` and unawaited, JS's synchronous run-to-first-`await` semantics mean calling `CleanupOldMediaService()` right after does not block or delay session restoration — both async functions yield control at their first `await` in the same tick, so WhatsApp session bootstrap proceeds independently and concurrently. No blocking risk found.
- [x] Test file mocks `Message.findAll` and `fs.promises.unlink` directly (not testing mock behavior), asserts real production code paths: file unlink + `update({mediaUrl:null})`, the actual `where` clause shape (including cutoff date math within a 5s tolerance), per-file error isolation across a batch, and multi-batch looping with `setTimeout` spied/auto-flushed to verify 2 pauses across 3 `findAll` calls with the correct 500ms value. Assertions are concrete and non-vacuous.
- [x] No scope creep: search for `CleanupOldMediaService`/`mediaCleanup` confirms only the 3 intended files were touched (CleanupOldMediaService.ts, server.ts, the spec file). No package.json, Dockerfile, or WhatsApp provider/auth/session file changes.
- [x] TypeScript casts reviewed: `null as unknown as string` in the `Op.ne` where-clause is needed because Sequelize's typed `WhereOptions` doesn't accept `null` directly for a `string`-typed column filter — cosmetic TS appeasement, not hiding a real bug (structurally the object is still `{ [Op.ne]: null }`, verified by the test). `getDataValue("mediaUrl") as string` is safe given the query already filters `mediaUrl: { [Op.ne]: null }`, so a non-null string is guaranteed at that point.

## Summary
The implementation matches the plan precisely: batched deletion (200/batch, 500ms pause between batches) with proper query scoping, correct raw-filename retrieval that bypasses the URL-prepending getter, per-file error isolation (silent ENOENT, logged otherwise) that never aborts a batch, unconditional DB nulling of `mediaUrl`, and a top-level catch-all that guarantees the function never rejects when invoked bare from `setInterval`. The `server.ts` wiring is minimal (3 lines) and, since neither `StartAllWhatsAppsSessions()` nor `CleanupOldMediaService()` is awaited, there is no risk of the cleanup job delaying or blocking WhatsApp session restoration. The new Jest spec exercises real logic (query shape, batching, error isolation) rather than mock plumbing. No scope creep, no new dependencies, no Dockerfile/session/auth changes. Approved as-is.
