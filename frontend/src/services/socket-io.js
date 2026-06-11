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
