# Plan: Singleton Socket — Fix Live Message Delivery

## Root Cause
`socket-io.js` does not cache the socket, so socket.io-client's internal Manager cache is used.
All 6 places that call `openSocket()` may share the same socket object (same URL, same namespace "/").
Each calls `socket.disconnect()` in cleanup — killing the shared connection for everyone.

When any component re-renders and its cleanup fires (e.g., useAuth when `user` changes,
TicketsList when `searchParam` changes), the shared socket is disconnected.
MessagesList is left with a dead socket and stops receiving `appMessage` events.
Meanwhile, TicketsList creates a new socket (on re-mount) and receives events fine —
which is why the left panel updates but the open chat doesn't.

## Fix: Singleton Socket
One socket for the entire app lifetime. Never voluntarily disconnected during a session.
Components manage only their own listeners via named handlers + `socket.off(event, fn)`.
On logout: call `disconnectSocket()` which disconnects and clears the singleton.

## Files to Change (7)

### [x] 1. `frontend/src/services/socket-io.js`
Replace the current per-call factory with a singleton:

```js
import openSocket from "socket.io-client";
import { getBackendUrl } from "../config";

let socket = null;

function connectToSocket() {
  if (!socket) {
    const token = localStorage.getItem("token");
    socket = openSocket(getBackendUrl(), {
      transports: ["websocket", "polling", "flashsocket"],
      query: { token: JSON.parse(token) },
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export default connectToSocket;
```

### [x] 2. `frontend/src/components/MessagesList/index.js`
In the socket `useEffect`, extract the handler to a named const + replace `socket.disconnect()` with `socket.off()`.

From:
```js
useEffect(() => {
  const socket = openSocket();
  socket.on('appMessage', (data) => {
    ...
  });
  return () => {
    socket.disconnect();
  };
}, [ticketId]);
```

To:
```js
useEffect(() => {
  const socket = openSocket();
  const handleAppMessage = (data) => {
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
  };
  socket.on('appMessage', handleAppMessage);
  return () => {
    socket.off('appMessage', handleAppMessage);
  };
}, [ticketId]);
```

### [x] 3. `frontend/src/components/Ticket/index.js`
In the socket `useEffect`, extract handlers + replace disconnect with off.

From:
```js
useEffect(() => {
  const socket = openSocket();
  socket.on("ticket", (data) => {
    if (data.action === "update" && String(data.ticket?.id) === String(ticketId)) { ... }
    if (data.action === "delete" && String(data.ticketId) === String(ticketId)) { ... }
  });
  socket.on("contact", (data) => { ... });
  return () => { socket.disconnect(); };
}, [ticketId, history]);
```

To:
```js
useEffect(() => {
  const socket = openSocket();
  const handleTicket = (data) => {
    if (data.action === "update" && String(data.ticket?.id) === String(ticketId)) {
      setTicket(data.ticket);
      const prev = ticketCache.get(String(ticketId));
      ticketCache.set(String(ticketId), { contact: data.ticket.contact || prev?.contact, ticket: data.ticket });
    }
    if (data.action === "delete" && String(data.ticketId) === String(ticketId)) {
      toast.success("Ticket deleted sucessfully.");
      history.push("/tickets");
    }
  };
  const handleContact = (data) => {
    if (data.action === "update") {
      setContact((prevState) => {
        if (prevState.id === data.contact?.id) {
          return { ...prevState, ...data.contact };
        }
        return prevState;
      });
    }
  };
  socket.on("ticket", handleTicket);
  socket.on("contact", handleContact);
  return () => {
    socket.off("ticket", handleTicket);
    socket.off("contact", handleContact);
  };
}, [ticketId, history]);
```

### [x] 4. `frontend/src/components/TicketsList/index.js`
In the socket `useEffect`, extract handlers + replace disconnect with off.

From:
```js
useEffect(() => {
  const socket = openSocket();
  const shouldUpdateTicket = ticket => ...;
  const notBelongsToUserQueues = ticket => ...;
  socket.on("ticket", data => { ... });
  socket.on("appMessage", data => { ... });
  socket.on("contact", data => { ... });
  return () => { socket.disconnect(); };
}, [status, searchParam, showAll, user, selectedQueueIds]);
```

To:
```js
useEffect(() => {
  const socket = openSocket();
  const shouldUpdateTicket = ticket => !searchParam &&
    (!ticket.userId || ticket.userId === user?.id || showAll) &&
    (!ticket.queueId || selectedQueueIds.indexOf(ticket.queueId) > -1);
  const notBelongsToUserQueues = ticket =>
    ticket.queueId && selectedQueueIds.indexOf(ticket.queueId) === -1;

  const handleTicket = (data) => {
    if (data.action === "updateUnread") {
      dispatch({ type: "RESET_UNREAD", payload: data.ticketId });
    }
    if (data.action === "update" && shouldUpdateTicket(data.ticket)) {
      dispatch({ type: "UPDATE_TICKET", payload: data.ticket });
    }
    if (data.action === "update" && notBelongsToUserQueues(data.ticket)) {
      dispatch({ type: "DELETE_TICKET", payload: data.ticket.id });
    }
    if (data.action === "delete") {
      dispatch({ type: "DELETE_TICKET", payload: data.ticketId });
    }
  };
  const handleAppMessage = (data) => {
    if (data.action === "create" && shouldUpdateTicket(data.ticket)) {
      dispatch({ type: "UPDATE_TICKET_UNREAD_MESSAGES", payload: data.ticket });
    }
  };
  const handleContact = (data) => {
    if (data.action === "update") {
      dispatch({ type: "UPDATE_TICKET_CONTACT", payload: data.contact });
    }
  };

  socket.on("ticket", handleTicket);
  socket.on("appMessage", handleAppMessage);
  socket.on("contact", handleContact);

  return () => {
    socket.off("ticket", handleTicket);
    socket.off("appMessage", handleAppMessage);
    socket.off("contact", handleContact);
  };
}, [status, searchParam, showAll, user, selectedQueueIds]);
```

### [x] 5. `frontend/src/components/NotificationsPopOver/index.js`
Extract handlers + replace disconnect with off.

The useEffect (at dependency `[user]`) currently has:
```js
socket.on("ticket", data => { ... });
socket.on("appMessage", data => { ... });
return () => { socket.disconnect(); };
```

Change to named `handleTicket` + `handleAppMessage` const functions, same logic, then:
```js
return () => {
  socket.off("ticket", handleTicket);
  socket.off("appMessage", handleAppMessage);
};
```

### [x] 6. `frontend/src/layout/MainListItems.js`
Extract handlers + replace disconnect with off.

The useEffect (at dependency `[]`) currently has:
```js
socket.on("appMessage", data => { ... });
socket.on("ticket", data => { ... });
return () => socket.disconnect();
```

Change to named `handleAppMessage` + `handleTicket` const functions, same logic, then:
```js
return () => {
  socket.off("appMessage", handleAppMessage);
  socket.off("ticket", handleTicket);
};
```

### [x] 7. `frontend/src/hooks/useAuth.js/index.js`
Import `disconnectSocket` from socket-io. In handleLogout, call `disconnectSocket()` before or after clearing the token. Extract handler + replace disconnect with off.

The useEffect (at dependency `[user]`) currently has:
```js
const socket = openSocket();
socket.on("user", data => { ... });
return () => { socket.disconnect(); };
```

Change to named `handleUser` + off:
```js
const handleUser = (data) => {
  if (data.action === "update" && data.user.id === user.id) {
    setUser(data.user);
  }
};
socket.on("user", handleUser);
return () => {
  socket.off("user", handleUser);
};
```

In `handleLogout`:
```js
import { disconnectSocket } from "../../services/socket-io";
// in handleLogout, after localStorage.removeItem("token"):
disconnectSocket();
```

---

## Important Notes for Coder
- Do NOT change any handler logic — only extract to named consts and change cleanup.
- The singleton `connectToSocket()` reads token from localStorage only once (on first call). This is correct: JWT is used for handshake only, not per-event.
- The `disconnectSocket()` must also set `socket = null` so the next login creates a fresh socket with the new token.
- Do NOT add `forceNew: true` — that would defeat the singleton purpose.

## Verification (after rebuild)
- [ ] Live message appears instantly in open chat without switching
- [ ] Header shows immediately on chat switch (no skeleton flash)
- [ ] Left panel updates on new message
- [ ] Logout and re-login works (new socket created with new token)
- [ ] Browser console shows no "socket already disconnected" or repeated connection errors
