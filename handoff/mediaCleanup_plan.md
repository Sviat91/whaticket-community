# Plan: Auto-delete media files older than 30 days

## Context

All uploaded/downloaded WhatsApp media (sent by agents via the UI, received from contacts) lands
flat in `backend/public/` via the single shared multer config (`src/config/upload.ts`), referenced
by `Message.mediaUrl` (DB column stores just the filename; the model getter prepends
`BACKEND_URL/public/`). Confirmed nothing else writes into `public/` (no avatars/logos — those are
external WhatsApp CDN URLs on `Contact`). No cron/scheduling infra exists anywhere in the backend
or Docker image (single `node dist/server.js` process, no cron daemon) — the one existing periodic
job in the codebase (`checkExternallyReadTickets` in `wwebjs.ts`) uses a plain `setInterval`, so we
follow that same pattern rather than adding a new dependency (e.g. node-cron).

User explicitly wants: **no dry-run, delete for real immediately** — main goal is freeing disk
space. The one hard requirement: **must not noticeably affect system performance/stability**, so
deletion must be batched with pauses, not a single unbounded pass, especially given there may be a
large backlog of old media on the very first run.

## Scope / non-goals

- No new dependency, no Dockerfile change, no DB schema change (only nulling an existing column).
- No dry-run mode, no configurable retention period via env var — 30 days is hardcoded per
  explicit request (trivial to change later if asked).
- Does not touch WhatsApp session/auth/socket code at all — fully decoupled feature.
- Does not attempt to clean up orphan files (files on disk with no matching `Message` row, e.g.
  from a past failed insert) — out of scope, not reported as a problem.

## Steps

- [x] 1. New file `backend/src/services/MessageServices/CleanupOldMediaService.ts`
  - Exports a single default async function `CleanupOldMediaService(): Promise<void>`.
  - Constants at top of file: `RETENTION_DAYS = 30`, `BATCH_SIZE = 200`, `BATCH_PAUSE_MS = 500`.
  - Reuse `uploadConfig.directory` from `../../config/upload` for the public folder path (don't
    recompute the path separately).
  - Logic: compute `cutoff = now - RETENTION_DAYS days`. Loop: `Message.findAll({ where: {
    mediaUrl: { [Op.ne]: null }, createdAt: { [Op.lt]: cutoff } }, limit: BATCH_SIZE })`. If the
    batch is empty, stop. For each message in the batch: read the raw filename via
    `message.getDataValue("mediaUrl")` (not the getter, which prepends the backend URL), attempt
    `fs.promises.unlink(path.join(uploadConfig.directory, fileName))` wrapped in try/catch (ignore
    `ENOENT` silently, log other errors via `logger.error` and continue — one bad file must not
    abort the batch), then `await message.update({ mediaUrl: null })` regardless of whether the
    unlink succeeded or the file was already gone. Track a running deleted count. After each batch,
    `await` a `BATCH_PAUSE_MS` delay before fetching the next batch.
  - Wrap the whole function body in a top-level try/catch that logs via `logger.error` and returns
    (must never throw into the caller — this runs on an unattended interval).
  - When finished (batch loop exits), if `deletedCount > 0`, log a single `logger.info` with the
    count.

- [x] 2. `backend/src/server.ts`
  - Import the new service.
  - After `StartAllWhatsAppsSessions();`, add a call to run it once on boot, then schedule it every
    24 hours: call the function directly, then `setInterval(CleanupOldMediaService, 24 * 60 * 60 *
    1000)`. Do not add any new dependency for scheduling.

## Testing

- Add a Jest unit spec under `backend/src/__tests__/unit/MessageServices/` (check existing spec
  conventions from the reply-fix session, e.g. `backend/src/__tests__/unit/WhatsApp/`, for how
  Sequelize models and `fs` are typically mocked in this repo) covering:
  - A message older than 30 days with a `mediaUrl` gets its file unlinked and `mediaUrl` set to
    `null` via `.update()`.
  - A message newer than 30 days is not touched (never appears in the mocked `findAll` result once
    the `where` clause is asserted, or is filtered by the mock appropriately).
  - If `fs.unlink` throws a non-ENOENT error for one file, the loop still processes the rest of the
    batch (doesn't throw out of the whole function).
  - Batching: with a mocked `findAll` returning multiple batches, confirm it's called more than
    once until an empty batch is returned, and that some delay/pause mechanism runs between calls
    (don't need to assert the exact 500ms, just that batching logic loops correctly and terminates).
- Per established project preference, do **not** run `npm test` or start any local DB/Docker — write
  and hand-trace the spec; verification happens by checking logs on the live server after deploy.

## Verification after deploy

- Confirm the app boots normally and logs show the cleanup job ran without error (even if it finds
  nothing to delete, e.g. if the app is younger than 30 days in production — in which case just
  confirm no errors were logged).
- If there is old media (>30 days) already in production `public/`, confirm after the first run
  that: those files are gone from disk, `mediaUrl` is null in the DB for those messages, and
  opening an old ticket with such a message no longer shows a broken-media icon (shows nothing /
  text-only, not an error).
- Confirm normal message/media sending and receiving is unaffected (this feature only reads/deletes
  old rows, never touches new ones).
