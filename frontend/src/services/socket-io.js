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
