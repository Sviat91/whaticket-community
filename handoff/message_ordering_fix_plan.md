# Plan: fix phantom / out-of-order messages in chat (frontend-only)

## Problem

Users intermittently see old-dated messages appearing below newer ones (or stale content that
looks like "another chat") inside the open conversation. No console errors. A full page reload
fixes it temporarily; it recurs after some time (correlates with socket reconnects).

Reload fixing it proves server data is correct — corruption is purely client-side in-memory
state. **No backend change is allowed** (would require WhatsApp session re-link).

## Root causes (all frontend)

1. No ordering guarantee in `frontend/src/components/MessagesList/index.js`:
   - `ADD_MESSAGE` reducer does `state.push()` → always bottom
   - `LOAD_MESSAGES` uses `appendToEnd`
   - cache merge appends `socketOnly` after page-1 data
   Any late / re-emitted / reconnect-refetched message lands at the bottom regardless of
   `createdAt`.
2. Module-level `messagesCache` Map survives navigation and can restore a stale / out-of-order
   snapshot.
3. `MessagesList` is mounted without `key` in `frontend/src/components/Ticket/index.js`, so
   reducer state can linger across ticket switches.

## Tasks

- [x] **T1 — sortMessages helper.** In `frontend/src/components/MessagesList/index.js`, add a
  module-level helper near `messagesCache` (line ~295):
  ```js
  const sortMessages = (list) => {
    const byId = new Map();
    for (const m of list) byId.set(m.id, m);            // dedup by id, last wins
    return Array.from(byId.values()).sort((a, b) => {
      if (a.createdAt < b.createdAt) return -1;          // ISO 8601 strings sort chronologically
      if (a.createdAt > b.createdAt) return 1;
      return String(a.id).localeCompare(String(b.id));   // stable tiebreak
    });
  };
  ```
  `createdAt` arrives from the API as an ISO 8601 string, so lexical compare == chronological.

- [x] **T2 — apply ordering in reducer.** Wrap the returned array in `sortMessages(...)` for the
  reducer branches `RESTORE_CACHE`, `LOAD_MESSAGES`, `ADD_MESSAGE`, and `UPDATE_MESSAGE`. With a
  global sort the `appendToEnd` / prepend logic still works but ordering is now correct by
  construction. Keep existing dedup-by-id logic; the helper also dedups as a safety net.

- [x] **T3 — order-stable cache writes.** Run the array through `sortMessages` before every
  `messagesCache.set(...)`: the page-1 fetch merge (line ~410-418) and the socket
  `create` / `update` cache writes (line ~446-457).

- [x] **T4 — per-ticket isolation.** In `frontend/src/components/Ticket/index.js` add
  `key={ticketId}` to the `<MessagesList ...>` element (line ~240) so each ticket mounts with a
  fresh reducer state. `messagesCache` is module-level and survives the remount, so the
  instant cache-restore UX is preserved.

- [x] **T5 — build.** `cd frontend && npm run build` compiles clean.

## Constraints

- Touch ONLY `frontend/src/components/MessagesList/index.js` and
  `frontend/src/components/Ticket/index.js`.
- Do NOT touch the backend, the socket singleton (`services/socket-io.js`), or reconnect logic.
- Surgical changes only — no refactoring of adjacent code.
- Match existing code style.
