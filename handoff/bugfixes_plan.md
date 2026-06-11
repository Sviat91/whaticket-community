# Plan: Fix realtime degradation, 403 spam, unread counters, eternal clock, replies, emoji scrollbar

## Context

The app (Whaticket fork used as a WhatsApp Web clone for ~10 logistics coworkers) has a cluster of bugs that share two root causes plus several independent ones:

**Root cause #1 — realtime death after token refresh (THE central bug).**
`frontend/src/services/socket-io.js` `reconnectSocket()` does `socket.disconnect(); socket = null;`. It is called after every token refresh (access token TTL = 15 min). All ~6 components (MessagesList, Ticket, TicketsList, NotificationsPopOver, MainListItems, useAuth) captured the OLD socket instance in useEffect closures and never re-subscribe. Result: after ≤15 min every socket-driven feature silently dies until F5 — incoming messages stop appearing, optimistic "pending" bubbles never clear (stuck clock duplicates), unread badges freeze, tab favicon "lives its own life". **Yesterday's fix actively kills realtime every 15 minutes.**

Additional hole found: backend `socket.ts` kicks sockets with bad tokens via server-side `socket.disconnect()` → socket.io-client v3 receives reason `"io server disconnect"` which **disables auto-reconnect entirely** (e.g. after laptop sleep/resume with expired token → permanently silent client).

**Root cause #2 — three independent copies of unread state.**
1. Green per-chat badges (TicketsList reducer) — work fine, don't touch.
2. Red sidebar badge: `MainListItems.js` keeps its own `Set` from a one-shot fetch + socket events — gets stuck when events are missed (see root cause #1).
3. Tab title/favicon: `NotificationsPopOver` keeps a third state synced from a 500ms-debounced `useTickets` hook AND its own socket listeners → desync by design.

**403 console spam:** backend `isAuth` returns **403** for an expired access token. Refresh is purely *reactive*: every 15 min, every in-flight request gets a 403 (logged red in console) before the interceptor refreshes and retries. Functionally recovers, but spams console and causes UI hiccups. Fix: *proactive* refresh — schedule a refresh ~60s before JWT `exp`, so requests never carry an expired token.

**"Eternal clock" on media (survives F5 → it's a DB problem):** `handleMessageAck` (backend/src/handlers/handleWhatsappEvents.ts:313) waits 500 ms, does `Message.findByPk(messageId)`, and **silently returns if not found**. For media, `handleMessage` (download + saveMediaFile + ticket upsert) takes well over 500 ms, while WhatsApp's ack 1 (server) and ack 2 (delivered) fire within ~1-2 s of sending. Both acks hit a not-yet-existing row and are lost; the row is then created with the stale ack snapshot (often 0) → clock forever, even though the file was delivered. Secondary: the duplicate `media_uploaded` upsert can downgrade an already-written ack.

**Replies (quoted messages):** plan already approved at `handoff/reply_fix_plan.md` — **verified against current code, still accurate** (wwebjs.ts:329-340 `sendMessage` passes `""` and never cache-primes; wwebjs.ts:361-365 `sendMedia` passes the raw unserialized id; `SendWhatsAppMedia.ts` has no `quotedMsg`; `MessageController.ts` already imports `Message`, drops `quotedMsg` for media). Execute it as written; no amendments needed.

**Emoji picker white scrollbar (Windows + dark theme):** emoji-mart v3 `theme='dark'` is set correctly, but its CSS never styles the scrollbar → default white system scrollbar on Windows. Pure CSS override.

## Prioritization / deployment constraints (user requirement)

- **Stage 1 = ALL backend changes, bundled into ONE backend rebuild** — deploy tomorrow morning while the user can re-link the WhatsApp phone. `docker compose up -d --build backend`.
- **Stage 2 = frontend-only changes** — can be deployed remotely any time: `docker compose up -d --build frontend` does NOT restart the backend container, so the WhatsApp session is untouched.

---

# STAGE 1 — BACKEND (one rebuild, needs phone access)

## Task B1 — Reply (quoted message) fix, backend part

Execute `handoff/reply_fix_plan.md` **Files 1–4 exactly as written** (it is verified and approved):

- [x] `backend/src/providers/WhatsApp/types/ProviderOptions.ts` — add `quotedMessageFromMe?: boolean` to `SendMediaOptions`
- [x] `backend/src/providers/WhatsApp/Implementations/wwebjs.ts` `sendMessage` (~line 329) — `quotedMsgSerializedId` falls back to `undefined` (not `""`); before `wbot.sendMessage`, if `quotedMsgSerializedId` set: `getMessageById` → if null, `getChatById(to)` + `chat.fetchMessages({ limit: 50 })` (same pattern as `deleteMessage` at wwebjs.ts:444-450)
- [x] `backend/src/providers/WhatsApp/Implementations/wwebjs.ts` `sendMedia` (~line 361) — serialize the quoted id via `getSerializedMessageId(to, Boolean(options?.quotedMessageFromMe), options.quotedMessageId)`, same cache-prime, pass serialized id in `mediaOptions`
- [x] `backend/src/services/WbotServices/SendWhatsAppMedia.ts` — add `quotedMsg?: Message` to `Request` (import `Message` from `../../models/Message`), pass `quotedMessageId: quotedMsg?.id, quotedMessageFromMe: quotedMsg?.fromMe` in `mediaOptions`
- [x] `backend/src/controllers/MessageController.ts` `store` — parse `quotedMsg` from `req.body` (JSON string when multipart): `const rawQuotedMsg = req.body.quotedMsg; const quotedMsg = rawQuotedMsg ? (typeof rawQuotedMsg === "string" ? JSON.parse(rawQuotedMsg) : rawQuotedMsg) : undefined;` and pass `quotedMsg` into `SendWhatsAppMedia({ media, ticket, body, quotedMsg })` (text path already passes it)

## Task B2 — "Eternal clock": make ack handling race-proof

File: `backend/src/handlers/handleWhatsappEvents.ts`

- [x] In `handleMessageAck` (line 313): replace the single `setTimeout 500ms + findByPk + return if null` with a retry loop — up to **10 attempts, 1 s apart** — looking up the message; only give up (silent return) after all attempts. Keep the include/emit logic unchanged.
- [x] Never downgrade ack: `if (messageToUpdate.ack >= ack) return;` before `update({ ack })` — protects against out-of-order ack events.
- [x] Guard against the duplicate-upsert downgrade: in `handleMessage` (line 264), before `CreateMessageService`, fetch existing row's ack: `const existing = await Message.findByPk(processedMessage.id); if (existing && existing.ack > messageData.ack) messageData.ack = existing.ack;` (covers `media_uploaded` firing after `message_ack` already wrote ack 2). Verify `Message` model is imported in this file; if not, add the import.

## Task B3 — externally-read detection never works for groups

File: `backend/src/handlers/handleWhatsappEvents.ts`, `checkExternallyReadTickets` (line 349)

- [x] chatId is hardcoded `@c.us` → group tickets never auto-clear their unread count when read from the phone. Change to: `const chatId = \`${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us\`;` (Ticket model has `isGroup`).

## Stage 1 verification

- [x] `cd backend && npm run build` — 0 errors
- [ ] Deploy tomorrow morning: `docker compose up -d --build backend`, re-link WhatsApp if needed
- [ ] Test: send media → status icon progresses clock → ✓ → ✓✓ (and survives F5); reply to a message (text and media) → quote bubble visible in CRM and on the phone; read a group chat from the phone → its unread clears in ≤30 s

---

# STAGE 2 — FRONTEND (remote deploy, no session risk)

## Task F1 — Socket lifecycle: never replace the singleton instance

- [x] Rewrite `frontend/src/services/socket-io.js` in full:

```js
import openSocket from "socket.io-client";
import { getBackendUrl } from "../config";

let socket = null;
let hasConnectedOnce = false;

function getToken() {
  try {
    return JSON.parse(localStorage.getItem("token"));
  } catch (err) {
    return null;
  }
}

function connectToSocket() {
  if (!socket) {
    socket = openSocket(getBackendUrl(), {
      transports: ["websocket", "polling", "flashsocket"],
      query: { token: getToken() },
    });

    // socket.io-client v3: manager-level event. Refresh token before EVERY
    // automatic reconnect attempt so reconnects never reuse a stale token.
    socket.io.on("reconnect_attempt", () => {
      socket.io.opts.query = { token: getToken() };
    });

    // Any successful connect AFTER the first one = we may have missed events.
    socket.on("connect", () => {
      if (hasConnectedOnce) {
        window.dispatchEvent(new CustomEvent("socket-reconnected"));
      }
      hasConnectedOnce = true;
    });

    // Backend kicks bad-token sockets via socket.disconnect() server-side →
    // reason "io server disconnect" → v3 DISABLES auto-reconnect. Ask the
    // auth layer to refresh and reconnect us.
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect" && localStorage.getItem("token")) {
        window.dispatchEvent(new CustomEvent("socket-auth-failure"));
      }
    });
  }
  return socket;
}

// Logout only.
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    hasConnectedOnce = false;
  }
}

// Called after token refresh. NEVER replaces the instance — all component
// listeners stay valid. A live socket keeps working (server validates token
// only at handshake), so no forced bounce.
export function reconnectSocket() {
  if (!socket) return;
  socket.io.opts.query = { token: getToken() };
  if (!socket.connected) {
    socket.connect();
  }
}

export default connectToSocket;
```

Notes: backend reads `socket.handshake.query.token`, so `opts.query` (NOT v3 `auth`) is the correct knob. Do not call `disconnect()` inside `reconnectSocket()`.

## Task F2 — useAuth: proactive refresh + socket-auth-failure handler

File: `frontend/src/hooks/useAuth.js/index.js`

- [x] Add a module-level shared refresh function and proactive timer (above the `useAuth` hook, next to `isRefreshing`/`failedQueue`):

```js
let refreshTimer = null;

const scheduleProactiveRefresh = (jwt) => {
  if (refreshTimer) clearTimeout(refreshTimer);
  try {
    const { exp } = JSON.parse(atob(jwt.split(".")[1]));
    const delay = exp * 1000 - Date.now() - 60000; // 60s before expiry
    refreshTimer = setTimeout(() => {
      refreshAccessToken().catch(() => {});
    }, Math.max(delay, 10000));
  } catch (err) {
    // malformed token — interceptor fallback will handle it
  }
};

const refreshAccessToken = async () => {
  if (isRefreshing) return null;
  isRefreshing = true;
  try {
    const { data } = await api.post("/auth/refresh_token");
    localStorage.setItem("token", JSON.stringify(data.token));
    api.defaults.headers.Authorization = `Bearer ${data.token}`;
    processQueue(null, data.token);
    reconnectSocket();
    scheduleProactiveRefresh(data.token);
    return data;
  } catch (err) {
    processQueue(err, null);
    throw err;
  } finally {
    isRefreshing = false;
  }
};
```

- [x] Refactor the three existing refresh sites to reuse it and schedule the timer:
  - **Startup useEffect** (lines ~106-129): call `refreshAccessToken()`; on success additionally `setIsAuth(true); setUser(data.user);`; on error keep `localStorage.removeItem("token"); toastError(err);`. (Drop the inline duplicate logic.)
  - **Response interceptor 403 branch** (lines ~73-93): replace the inline refresh body with `const data = await refreshAccessToken();` then `setUser(data.user); return api(originalRequest);` — keep the existing catch (remove token, `setIsAuth(false)`) and the refresh-endpoint guard as is. Note: when `refreshAccessToken()` returns `null` (already refreshing), fall through to the existing failedQueue wait path.
  - **`handleLogin`**: after saving the token, add `scheduleProactiveRefresh(data.token); reconnectSocket();`.
- [x] In `handleLogout` (and anywhere token is purged): `if (refreshTimer) clearTimeout(refreshTimer);`.
- [x] Add a new `useEffect(..., [])` listening for the kick signal:

```js
useEffect(() => {
  const handleSocketAuthFailure = () => {
    if (!localStorage.getItem("token")) return;
    refreshAccessToken().catch(() => {});
  };
  window.addEventListener("socket-auth-failure", handleSocketAuthFailure);
  return () => window.removeEventListener("socket-auth-failure", handleSocketAuthFailure);
}, []);
```

Result: requests never carry an expired token in normal operation → no more 403 bursts in console; the interceptor remains as fallback for sleep/resume edge cases.

## Task F3 — Single source of truth for unread: UnreadContext

- [x] Create `frontend/src/context/Unread/UnreadContext.js`:

```js
import React, { createContext, useState, useEffect, useCallback } from "react";
import openSocket from "../../services/socket-io";
import api from "../../services/api";

const UnreadContext = createContext({ unreadTicketIds: new Set(), unreadCount: 0 });

const UnreadProvider = ({ children }) => {
  const [unreadTicketIds, setUnreadTicketIds] = useState(new Set());

  const refreshUnread = useCallback(async () => {
    try {
      const { data } = await api.get("/tickets", { params: { withUnreadMessages: "true" } });
      setUnreadTicketIds(new Set(data.tickets.map((t) => t.id)));
    } catch (err) {
      // silent — next reconnect/visibility refresh retries
    }
  }, []);

  useEffect(() => {
    refreshUnread();

    const handleReconnected = () => refreshUnread();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshUnread();
    };
    window.addEventListener("socket-reconnected", handleReconnected);
    document.addEventListener("visibilitychange", handleVisibility);

    const socket = openSocket();
    const handleAppMessage = (data) => {
      if (data.action === "create" && !data.message.read) {
        setUnreadTicketIds((prev) =>
          prev.has(data.ticket.id) ? prev : new Set(prev).add(data.ticket.id)
        );
      }
    };
    const handleTicket = (data) => {
      if (data.action === "updateUnread" || data.action === "delete") {
        setUnreadTicketIds((prev) => {
          if (!prev.has(data.ticketId)) return prev;
          const next = new Set(prev);
          next.delete(data.ticketId);
          return next;
        });
      }
    };
    socket.on("appMessage", handleAppMessage);
    socket.on("ticket", handleTicket);

    return () => {
      window.removeEventListener("socket-reconnected", handleReconnected);
      document.removeEventListener("visibilitychange", handleVisibility);
      socket.off("appMessage", handleAppMessage);
      socket.off("ticket", handleTicket);
    };
  }, [refreshUnread]);

  return (
    <UnreadContext.Provider value={{ unreadTicketIds, unreadCount: unreadTicketIds.size }}>
      {children}
    </UnreadContext.Provider>
  );
};

export { UnreadContext, UnreadProvider };
```

Note: NO user filter in `handleAppMessage` — must mirror the backend's global `withUnreadMessages` query (`ListTicketsService.ts:123` replaces the where with `unreadMessages > 0`, unfiltered), otherwise count drifts on every refetch.

- [x] Mount in `frontend/src/routes/index.js`: `<WhatsAppsProvider><UnreadProvider><LoggedInLayout>...` (same authenticated subtree as WhatsAppsProvider).
- [x] `frontend/src/layout/MainListItems.js`: delete local `unreadTicketIds` state (line ~63), the one-shot-fetch + socket-listener useEffect (lines ~65-89), and now-unused `openSocket`/`api` imports. Consume `const { unreadCount } = useContext(UnreadContext);` and render `<Badge badgeContent={unreadCount} color="secondary" max={99}>`.
- [x] `frontend/src/components/NotificationsPopOver/index.js`: remove `useTickets` import+call, the `notifications` state and its sync effect; consume `unreadCount` from UnreadContext; replace the title/favicon effect with:

```js
useEffect(() => {
  document.title = unreadCount > 0 ? `(${unreadCount}) AVS-Chats` : "AVS-Chats";
  updateFavicon(unreadCount);
}, [unreadCount]);
```

  In its socket effect, remove only the `setNotifications(...)` blocks; keep desktop-notification logic (`setDesktopNotifications`, `shouldNotNotificate`, sound, the user-filter guard) untouched.

## Task F4 — Missed-data recovery on reconnect

- [x] `frontend/src/hooks/useTickets/index.js`: add `reconnectKey` state incremented by a `window` listener for `"socket-reconnected"`; add `reconnectKey` to the fetch effect's dependency array (the existing 500 ms debounce absorbs doubles). Covers TicketsList + Dashboard.
- [x] `frontend/src/components/TicketsList/index.js`: add an effect that on `"socket-reconnected"` dispatches `{ type: "RESET" }` and `setPageNumber(1)` — purges tickets that were closed/transferred while the socket was dead.
- [x] `frontend/src/components/MessagesList/index.js`: add `reconnectKey` state; on `"socket-reconnected"`: `setPageNumber(1); setReconnectKey(k => k + 1);`; add `reconnectKey` to the message-fetch effect deps (`[pageNumber, ticketId]` → `[pageNumber, ticketId, reconnectKey]`). `LOAD_MESSAGES` upserts by id, so missed messages merge without flashing.

## Task F5 — Reply fix, frontend part (File 5 of handoff/reply_fix_plan.md)

- [x] `frontend/src/components/MessageInput/index.js` `handleSendMessage`: capture `const quotedMsgSnapshot = replyingMessage;` at the top (before any state clearing); in the media FormData block after `formData.append("body", ...)` add:

```js
if (quotedMsgSnapshot) {
  formData.append("quotedMsg", JSON.stringify(quotedMsgSnapshot));
}
```

## Task F6 — Emoji picker scrollbar on dark theme (Windows)

- [x] Add scrollbar overrides where emoji-mart CSS is globally available (e.g. `frontend/src/index.css` or the global stylesheet already imported in `index.js` — check what exists; create/extend accordingly), scoped to emoji-mart's own dark class (`.emoji-mart-dark`, set automatically by `theme='dark'`):

```css
.emoji-mart-dark .emoji-mart-scroll::-webkit-scrollbar {
  width: 8px;
}
.emoji-mart-dark .emoji-mart-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.emoji-mart-dark .emoji-mart-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 4px;
}
.emoji-mart-dark .emoji-mart-scroll {
  scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
  scrollbar-width: thin;
}
```

## Stage 2 verification

- [x] `cd frontend && npm run build` — 0 errors
- [ ] Deploy remotely any time: `docker compose up -d --build frontend` (backend container untouched → WhatsApp session safe)
- [ ] Token: leave tab open >15 min → no 403 burst in console (Network shows a quiet `/auth/refresh_token` ~1 min before expiry), incoming messages still render live
- [ ] Network drop: DevTools Offline 30 s while a message arrives elsewhere → back Online → missed message appears, badge/title/favicon update without F5
- [ ] Counters: new unread → sidebar badge, `(N)` title, favicon dot all show same N; open the chat → all three clear together
- [ ] Reply (after Stage 1 deployed): text reply and media reply both show the quote bubble in CRM and on the phone
- [ ] Emoji: dark theme on Windows → dark thin scrollbar in picker

---

# Other findings (NOT in scope now — flag to user, fix later if desired)

1. `SendRefreshToken.ts` cookie lacks `secure`, `sameSite`, `path`, `maxAge` — should be hardened for production HTTPS.
2. `CreateTokens.ts:9` payload typo `usarname` (cosmetic, nothing reads it).
3. `isAuthApi` (external API tokens) validates against the DB and returns 403 on DB hiccups.
4. Occasional `400 Bad Request` on `GET /messages/X` in console — separate low-priority investigation (likely requests for deleted/foreign tickets racing the tickets list).
5. Backend emits ALL socket events globally to every client (`io.emit`) — fine at ~10 users, but every user sees every chat's traffic; rooms would be needed for per-user scoping someday.
6. Deploy note: per yesterday's session notes the token-refresh fixes were never deployed — part of the 403 behavior currently seen on prod is expected until Stage 2 ships.
