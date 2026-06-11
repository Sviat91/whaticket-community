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
