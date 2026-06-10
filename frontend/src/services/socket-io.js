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

export function reconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  // connectToSocket() will pick up the new token from localStorage on next call
}

export default connectToSocket;
