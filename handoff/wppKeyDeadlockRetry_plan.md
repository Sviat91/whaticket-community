# Plan: Retry MySQL deadlocks when persisting Baileys session keys

## Root cause (confirmed via production logs, prior session)

`StoreWppSessionKeys.ts` persists Baileys signal/app-state-sync keys to the `WppKeys` MySQL table
via `WppKey.upsert(...)`. During a reconnect burst (e.g. after a `device_removed` stream conflict),
multiple keys get upserted concurrently, causing MySQL `ER_LOCK_DEADLOCK` ("Deadlock found when
trying to get lock") errors. The current `catch` block only logs the error — the key write is
permanently lost, no retry. Losing `app-state-sync-key` data breaks Baileys' ability to decrypt/
verify future protocol state for that session, contributing to the "message stuck at single
checkmark" delivery-failure symptom reported by the user.

## Scope / non-goals

- Only touches the MySQL write path in `StoreWppSessionKeys.ts`. Does not touch the Redis path
  (`REDIS_KEY_TYPES` branch), `GetWppSessionKeys.ts`, or any WhatsApp connection/reconnect logic.
- No new dependency. No DB schema change.
- Do not add retry logic for non-deadlock errors — only `ER_LOCK_DEADLOCK` (Sequelize wraps this as
  `error.original.code === "ER_LOCK_DEADLOCK"` / `error.name === "SequelizeDatabaseError"`). Other
  errors should keep failing fast and logging as today (Simplicity First — don't paper over
  unrelated DB errors).
- Do not touch `WppKey` model or migrations.

## Steps

- [x] 1. `backend/src/services/WppKeyServices/StoreWppSessionKeys.ts`
  - Wrap the existing `WppKey.upsert(...)` call in a small retry loop (max 3 attempts total, short
    delay between attempts e.g. 100-300ms) that retries **only** when the caught error is a MySQL
    deadlock (`err.original?.code === "ER_LOCK_DEADLOCK"` or `err.parent?.code === "ER_LOCK_DEADLOCK"`
    — check which Sequelize exposes at runtime, both `original` and `parent` point to the same
    underlying driver error).
  - On the final failed attempt (deadlock persisted through all retries, or any non-deadlock
    error), keep the existing `logger.error({...})` call unchanged so current log-based visibility
    isn't lost.
  - Keep the function signature, the Redis branch, and everything else in the file unchanged.

## Testing

- Per established project preference (see [[feedback_no_unprompted_docker_local]]), do not run
  `npm test` locally (requires MySQL, previously triggered an unwanted Docker Desktop launch).
- Verify by reading the diff: confirm the retry only fires on deadlock error codes, confirm it
  gives up after a bounded number of attempts (no infinite loop), confirm the original logging
  behavior is preserved on final failure.
- Real-world verification happens passively: if a `device_removed`-style reconnect happens again
  in production, check logs for `ER_LOCK_DEADLOCK` — it should now show retry attempts succeeding
  instead of a single immediate failure.

## Verification after deploy

- Deploy via `docker compose up -d --build backend`.
- No functional change expected for the normal (non-deadlock) path — key storage during a clean
  connect should behave identically.
- Ask user to flag if the same "stuck single checkmark" symptom recurs; if it does, the next
  investigation step (open, from prior session) is checking why the `device_removed` conflict
  happened in the first place.
