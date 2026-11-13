# Plan: offline_batch request + accept offline (append) incoming messages

## Problem
Production: no message events reach the app (neither incoming nor echoes of our own sends);
outgoing sends still go out. Root cause chain, verified in `node_modules/whaileys/lib`:
- On connect whaileys calls `ev.buffer()` (`Socket/socket.js:553`) and only `ev.flush()`es when the
  server sends `<ib><offline .../></ib>` (`Socket/messages-recv.js:730-735`), i.e. after all
  pending offline messages are delivered.
- Server now sends `<ib><offline_preview count="N"/></ib>` (N = 102 → 130 → 131 across restarts)
  and waits for the client to request `<ib><offline_batch count="100"/></ib>` (upstream Baileys
  does this). whaileys 6.5.0 has NO handler for it (only a log at `Socket/socket.js:219`).
- So the offline queue is never delivered, `ev.flush()` never happens, all events stay buffered.

Second bug: offline-delivered messages are upserted with type `"append"`
(`Socket/messages-recv.js:642`: `node.attrs.offline ? "append" : "notify"`). Our filter in
`whaileys.ts` drops `append` unless `fromMe`, so incoming offline messages would be discarded.
History sync does NOT go through `messages.upsert` in this lib (it uses `messaging-history.set`),
so accepting `append` does not import old history.

## Scope
Single file: `backend/src/providers/WhatsApp/Implementations/whaileys.ts`. No other files.
Do NOT touch `nameLocked` logic anywhere.

## Steps
- [x] 1. Right after the `wbot.ev.on("creds.update", ...)` registration (around line 988), add a
  persistent listener (`on`, not `once` — the server may send several previews for >100 messages):
  ```ts
  wbot.ws.on("CB:ib,,offline_preview", async () => {
    try {
      await wbot.sendNode({
        tag: "ib",
        attrs: {},
        content: [{ tag: "offline_batch", attrs: { count: "100" } }]
      });
    } catch (err) {
      logger.error(err, "Error requesting offline batch");
    }
  });
  ```
  `ws` and `sendNode` are both returned by whaileys' `makeSocket` (`lib/Socket/socket.js:579-592`).
  Event name format `CB:<tag>,,<firstChildTag>` matches the emit logic in `socket.js:242`.
  If TS complains about the `Session` type, check how `Session` is declared in this file and use
  the lib's own types — avoid `any` unless unavoidable.
- [x] 2. In the `messages.upsert` filter (around line 1013), change
  `if (type === "append" && msg.key.fromMe) return true;` to `if (type === "append") return true;`.
- [x] 3. `cd backend && npm run build` must pass.

## Verify
- Build passes.
- `git diff` touches only the two spots above.
