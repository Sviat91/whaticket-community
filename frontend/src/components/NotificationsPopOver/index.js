import React, { useState, useRef, useEffect, useContext } from "react";
import { useHistory } from "react-router-dom";
import { format } from "date-fns";
import openSocket from "../../services/socket-io";
import useSound from "use-sound";

import { i18n } from "../../translate/i18n";
import alertSound from "../../assets/sound.mp3";
import { AuthContext } from "../../context/Auth/AuthContext";
import { UnreadContext } from "../../context/Unread/UnreadContext";
import { updateFavicon } from "../../utils/favicon";

const NotificationsPopOver = () => {
	const history = useHistory();
	const { user } = useContext(AuthContext);
	const { unreadCount } = useContext(UnreadContext);
	const ticketIdUrl = +history.location.pathname.split("/")[2];
	const ticketIdRef = useRef(ticketIdUrl);
	const [, setDesktopNotifications] = useState([]);

	const [play] = useSound(alertSound);
	const soundAlertRef = useRef();
	const historyRef = useRef(history);

	useEffect(() => {
		soundAlertRef.current = play;
		if (!("Notification" in window)) {
			console.log("This browser doesn't support notifications");
		} else {
			Notification.requestPermission();
		}
	}, [play]);

	useEffect(() => {
		ticketIdRef.current = ticketIdUrl;
	}, [ticketIdUrl]);

	useEffect(() => {
		document.title = unreadCount > 0 ? `(${unreadCount}) AVS-Chats` : "AVS-Chats";
		updateFavicon(unreadCount);
	}, [unreadCount]);

	useEffect(() => {
		const socket = openSocket();

		const handleTicket = (data) => {
			if (data.action === "updateUnread" || data.action === "delete") {
				setDesktopNotifications(prevState => {
					const notfiticationIndex = prevState.findIndex(
						n => n.tag === String(data.ticketId)
					);
					if (notfiticationIndex !== -1) {
						prevState[notfiticationIndex].close();
						prevState.splice(notfiticationIndex, 1);
						return [...prevState];
					}
					return prevState;
				});
			}
		};
		const handleAppMessage = (data) => {
			if (
				data.action === "create" &&
				!data.message.read &&
				(data.ticket.userId === user?.id || !data.ticket.userId)
			) {
				const shouldNotNotificate =
					(data.message.ticketId === ticketIdRef.current &&
						document.visibilityState === "visible") ||
					(data.ticket.userId && data.ticket.userId !== user?.id) ||
					data.ticket.isGroup;

				if (shouldNotNotificate) return;

				handleNotifications(data);
			}
		};

		socket.on("ticket", handleTicket);
		socket.on("appMessage", handleAppMessage);

		return () => {
			socket.off("ticket", handleTicket);
			socket.off("appMessage", handleAppMessage);
		};
	}, [user]);

	const handleNotifications = data => {
		const { message, contact, ticket } = data;

		const options = {
			body: `${message.body} - ${format(new Date(), "HH:mm")}`,
			icon: contact.profilePicUrl,
			tag: ticket.id,
			renotify: true,
		};

		const notification = new Notification(
			`${i18n.t("tickets.notification.message")} ${contact.name}`,
			options
		);

		notification.onclick = e => {
			e.preventDefault();
			window.focus();
			historyRef.current.push(`/tickets/${ticket.id}`);
		};

		setDesktopNotifications(prevState => {
			const notfiticationIndex = prevState.findIndex(
				n => n.tag === notification.tag
			);
			if (notfiticationIndex !== -1) {
				prevState[notfiticationIndex] = notification;
				return [...prevState];
			}
			return [notification, ...prevState];
		});

		soundAlertRef.current();
	};

	return null;
};

export default NotificationsPopOver;
