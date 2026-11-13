# Plan: safety flush of whaileys event buffer after connect

## Problem
Follow-up to `handoff/offlineBatch_plan.md` (deployed, insufficient). Production still gets no
`messages.upsert` events (no "[RAW] Message received", no "handled N offline" in logs; DB has no new
messages). whaileys calls `ev.buffer()` on connect (`node_modules/whaileys/lib/Socket/socket.js:553`)
and only calls `ev.flush()` when the server sends `<ib><offline/></ib>`
(`Socket/messages-recv.js:730-735`). The server never sends it, so `messages.upsert`,
`messages.update`, `message-receipt.update` etc. (`Utils/event-buffer.js:12-25`) stay buffered
forever. `ev.buffer()` has no timeout in this lib. `connection.update` is NOT bufferable, so our
`connection === "open"` branch still runs.

## Fix
Safety net: shortly after the connection opens, force-flush the buffer. If the server already
completed offline delivery, `flush()` is a no-op (`isBuffering` false, `event-buffer.js:52-54`).
After flush, `isBuffering` is false, so live events are emitted immediately; the later
`CB:ib,,offline` handler calling `flush()` again is also a no-op.

## Scope
Single file: `backend/src/providers/WhatsApp/Implementations/whaileys.ts`. Keep the previous
offline_batch change as-is. Do NOT touch `nameLocked`.

## Steps
- [x] 1. In the `connection.update` handler, inside `if (connection === "open") { ... }`
  (around line 1129), right after `logger.info({ info: "Session connected", sessionId });`, add:
  ```ts
  setTimeout(() => {
    wbot.ev.flush().catch(err => {
      logger.error(err, "Error flushing whaileys event buffer");
    });
  }, 10000);
  ```
  `wbot` is the socket created in the same `init` closure; `ev.flush(): Promise<void>` is declared in
  `node_modules/whaileys/lib/Utils/event-buffer.d.ts:22`. If TS rejects `wbot.ev.flush`, check the
  `Session`/`WASocket` type and use the lib's own types; avoid `any`.
- [x] 2. `cd backend && npm run build` must pass.

## Verify
- Build passes; `git diff` touches only this spot.
