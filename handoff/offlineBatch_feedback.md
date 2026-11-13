# Review: offline_batch request + accept offline (append) incoming messages
**Date:** 2026-11-13
**Verdict:** APPROVED

## Critical/Architectural Issues
(none)

## Minor/Syntax Issues
(none)

## Passed Checks
- Listener `wbot.ws.on("CB:ib,,offline_preview", ...)` is persistent; event name matches emit logic in `whaileys/lib/Socket/socket.js:234-245`.
- `ws` and `sendNode` come from the same `makeSocket` closure; node shape matches `BinaryNode`.
- Filter change verified: `CreateMessageService` upserts by message id, so redelivered/echoed messages don't duplicate rows; `existing.ack` guard preserves higher ack.
- Diff limited to the two planned spots; `nameLocked` untouched; no `any` casts needed (`Session extends WASocket`).
