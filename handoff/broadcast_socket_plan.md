# Plan: Remove Socket Rooms → Broadcast All + Cache Fixes

## Goal
Replace the Socket.IO room-based architecture (joinChatBox / joinTickets / joinNotification)
with unconditional `io.emit()` broadcast. All filtering moves to the frontend.
Also fix: connection-gap message loss, cache overwrite bug, header flicker.

## Why this is safe
- Frontend components already filter events by their own logic (ticketId, userId, shouldUpdateTicket).
- The only new filtering needed: Ticket.js and MessagesList.js must check ticketId in handlers
  since they previously relied on room membership to receive only their own ticket's events.
- contact events are already io.emit() — no change needed.

## Backend changes (6 files)

### [x] 1. `backend/src/libs/socket.ts`
Remove the three `socket.on(...)` room-join handlers. Keep JWT verify and disconnect handlers.

Remove:
```ts
socket.on("joinChatBox", (ticketId: string) => {
  logger.info("A client joined a ticket channel");
  socket.join(ticketId);
});

socket.on("joinNotification", () => {
  logger.info("A client joined notification channel");
  socket.join("notification");
});

socket.on("joinTickets", (status: string) => {
  logger.info(`A client joined to ${status} tickets channel.`);
  socket.join(status);
});
```

### [x] 2. `backend/src/services/MessageServices/CreateMessageService.ts`
Lines ~56-64. Replace chained `.to()` with direct `io.emit()`.

From:
```ts
io.to(message.ticketId.toString())
  .to(message.ticket.status)
  .to("notification")
  .emit("appMessage", {
    action: "create",
    message,
    ticket: message.ticket,
    contact: message.ticket.contact
  });
```
To:
```ts
io.emit("appMessage", {
  action: "create",
  message,
  ticket: message.ticket,
  contact: message.ticket.contact
});
```

### [x] 3. `backend/src/controllers/MessageController.ts`
Line ~76. Replace `.to(ticketId)` with direct emit.

From:
```ts
io.to(message.ticketId.toString()).emit("appMessage", {
  action: "update",
  message
});
```
To:
```ts
io.emit("appMessage", {
  action: "update",
  message
});
```

### [x] 4. `backend/src/handlers/handleWhatsappEvents.ts`
Line ~336. Replace `.to(ticketId)` with direct emit.

From:
```ts
io.to(messageToUpdate.ticketId.toString()).emit("appMessage", {
  action: "update",
  message: messageToUpdate
});
```
To:
```ts
io.emit("appMessage", {
  action: "update",
  message: messageToUpdate
});
```

### [x] 5. `backend/src/helpers/SetTicketMessagesAsRead.ts`
Line ~34. Replace chained `.to()` with direct emit.

From:
```ts
io.to(ticket.status).to("notification").emit("ticket", {
  action: "updateUnread",
  ticketId: ticket.id
});
```
To:
```ts
io.emit("ticket", {
  action: "updateUnread",
  ticketId: ticket.id
});
```

### [x] 6. `backend/src/controllers/TicketController.ts`
Two emissions:

**store() ~line 69** — create ticket:
From: `io.to(ticket.status).emit("ticket", { action: "update", ticket });`
To:   `io.emit("ticket", { action: "update", ticket });`

**remove() ~line 122** — delete ticket:
From: `io.to(ticket.status).to(ticketId).to("notification").emit("ticket", { action: "delete", ticketId: +ticketId });`
To:   `io.emit("ticket", { action: "delete", ticketId: +ticketId });`

### [x] 7. `backend/src/services/TicketServices/UpdateTicketService.ts`
Two emissions:

**~line 64** — status change notification:
From: `io.to(oldStatus).emit("ticket", { action: "delete", ticketId: ticket.id });`
To:   `io.emit("ticket", { action: "delete", ticketId: ticket.id });`

**~line 70-76** — update:
From:
```ts
io.to(ticket.status)
  .to("notification")
  .to(ticketId.toString())
  .emit("ticket", { action: "update", ticket });
```
To:
```ts
io.emit("ticket", { action: "update", ticket });
```

---

## Frontend changes (5 files)

### [x] 8. `frontend/src/components/TicketsList/index.js`
In the socket `useEffect`, remove the join calls from the "connect" handler.

From:
```js
socket.on("connect", () => {
  if (status) {
    socket.emit("joinTickets", status);
  } else {
    socket.emit("joinNotification");
  }
});
```
To: remove the entire `socket.on("connect", ...)` block (the component has no other use for it).

### [x] 9. `frontend/src/components/NotificationsPopOver/index.js`
Remove the "connect" handler that emits joinNotification.

From: `socket.on("connect", () => socket.emit("joinNotification"));`
To: delete this line entirely.

### [x] 10. `frontend/src/layout/MainListItems.js`
Remove the "connect" handler that emits joinNotification.

From: `socket.on("connect", () => socket.emit("joinNotification"));`
To: delete this line entirely.

### [x] 11. `frontend/src/components/Ticket/index.js` — three changes

**A. Remove joinChatBox emit:**
From: `socket.on("connect", () => socket.emit("joinChatBox", ticketId));`
To: delete this line.

**B. Add ticketId filter to ticket event handler.**
Currently the handler blindly applies all ticket/delete events — after broadcast removal,
it will receive events for ALL tickets.

From:
```js
socket.on("ticket", (data) => {
  if (data.action === "update") {
    setTicket(data.ticket);
  }
  if (data.action === "delete") {
    toast.success("Ticket deleted sucessfully.");
    history.push("/tickets");
  }
});
```
To:
```js
socket.on("ticket", (data) => {
  if (data.action === "update" && String(data.ticket?.id) === String(ticketId)) {
    setTicket(data.ticket);
  }
  if (data.action === "delete" && String(data.ticketId) === String(ticketId)) {
    toast.success("Ticket deleted sucessfully.");
    history.push("/tickets");
  }
});
```

**C. Add ticketCache for instant header (no more header flicker).**
Above the component definition, add module-level cache:
```js
const ticketCache = new Map();
const TICKET_CACHE_MAX = 20;
```

Replace fetch useEffect:
From:
```js
useEffect(() => {
  setLoading(true);
  const delayDebounceFn = setTimeout(() => {
    const fetchTicket = async () => {
      try {
        const { data } = await api.get("/tickets/" + ticketId);
        setContact(data.contact);
        setTicket(data);
        setLoading(false);
      } catch (err) {
        setLoading(false);
        toastError(err);
      }
    };
    fetchTicket();
  }, 500);
  return () => clearTimeout(delayDebounceFn);
}, [ticketId, history]);
```

To (no debounce, instant cache restore):
```js
useEffect(() => {
  const cached = ticketCache.get(String(ticketId));
  if (cached) {
    setContact(cached.contact);
    setTicket(cached.ticket);
    setLoading(false);
  } else {
    setLoading(true);
  }

  const fetchTicket = async () => {
    try {
      const { data } = await api.get('/tickets/' + ticketId);
      ticketCache.set(String(ticketId), { contact: data.contact, ticket: data });
      if (ticketCache.size > TICKET_CACHE_MAX) {
        ticketCache.delete(ticketCache.keys().next().value);
      }
      setContact(data.contact);
      setTicket(data);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      toastError(err);
    }
  };
  fetchTicket();
}, [ticketId, history]);
```

### [x] 12. `frontend/src/components/MessagesList/index.js` — four changes

**A. Remove joinChatBox emit:**
From: `socket.on("connect", () => socket.emit("joinChatBox", ticketId));`
To: delete this line.

**B. Add ticketId filter in appMessage handler.**
After broadcast removal, this component receives ALL messages from ALL tickets.
Must filter by ticketId for both create and update actions.

From:
```js
socket.on('appMessage', (data) => {
  if (data.action === 'create') {
    pendingScrollNewMsg.current = true;
    dispatch({ type: 'ADD_MESSAGE', payload: data.message });
    ...
  }
  if (data.action === 'update') {
    dispatch({ type: 'UPDATE_MESSAGE', payload: data.message });
  }
});
```

To:
```js
socket.on('appMessage', (data) => {
  if (String(data.message?.ticketId) !== String(ticketId)) return;
  if (data.action === 'create') {
    pendingScrollNewMsg.current = true;
    dispatch({ type: 'ADD_MESSAGE', payload: data.message });
    if (data.message.fromMe && onFromMeMessage) {
      onFromMeMessage();
    }
    if (document.visibilityState === 'visible') {
      api.put('/messages/' + ticketId).catch(() => {});
    }
    const cached = messagesCache.get(String(ticketId));
    if (cached) {
      const exists = cached.some((m) => m.id === data.message.id);
      if (!exists) messagesCache.set(String(ticketId), [...cached, data.message]);
    }
  }
  if (data.action === 'update') {
    dispatch({ type: 'UPDATE_MESSAGE', payload: data.message });
  }
});
```

Note: the `String(data.message.ticketId) === String(ticketId)` check that previously existed
inside the handler for the `api.put` call is now handled by the top-level early return.

**C. Remove 500ms debounce for pageNumber === 1 (close connection gap).**
When switching to a new ticket, the fetch should start immediately (not after 500ms).
The 500ms debounce is still useful for pagination (pageNumber > 1) to prevent rapid scroll fires.

From:
```js
const delayDebounceFn = setTimeout(() => {
  const fetchMessages = async () => { ... };
  fetchMessages();
}, 500);
```

To:
```js
const delayDebounceFn = setTimeout(() => {
  const fetchMessages = async () => { ... };
  fetchMessages();
}, pageNumber === 1 ? 0 : 500);
```

**D. Fix cache overwrite — merge API data with socket-received messages.**
After LOAD_MESSAGES the cache currently stores only API data, losing any socket messages
that arrived between the cache restore and fetch completion.

From:
```js
if (pageNumber === 1) {
  messagesCache.set(String(ticketId), data.messages);
  if (messagesCache.size > CACHE_MAX_SIZE) {
    messagesCache.delete(messagesCache.keys().next().value);
  }
}
```

To:
```js
if (pageNumber === 1) {
  const prev = messagesCache.get(String(ticketId)) || [];
  const apiIds = new Set(data.messages.map(m => m.id));
  const socketOnly = prev.filter(m => !apiIds.has(m.id));
  messagesCache.set(String(ticketId), [...data.messages, ...socketOnly]);
  if (messagesCache.size > CACHE_MAX_SIZE) {
    messagesCache.delete(messagesCache.keys().next().value);
  }
}
```

---

## Rebuild instructions (for the user)
After coder completes all changes:
1. Backend: `cd backend && npm run build` — must succeed with 0 errors
2. Frontend: `cd frontend && npm run build` — must succeed with 0 errors
3. Docker: `docker compose up -d --build` to redeploy both services

## Verification checklist
- [ ] New message from WhatsApp contact appears instantly in open chat (no switch needed)
- [ ] Switching between chats: header appears instantly (no skeleton flash)
- [ ] Messages from other tickets do NOT appear in current chat's MessagesList
- [ ] TicketsList left panel still updates on new messages
- [ ] NotificationsPopOver bell still shows unread counts
- [ ] Ticket delete still redirects to /tickets for the correct ticket only
- [ ] Ticket status change (open → closed) still moves ticket in the list
