import React, { useContext, useEffect, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { makeStyles, Tooltip, IconButton, Badge, Divider } from "@material-ui/core";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import { ArrowLeftRight, Users, MessageSquare, UserCog, Settings } from "lucide-react";

import { i18n } from "../translate/i18n";
import { WhatsAppsContext } from "../context/WhatsApp/WhatsAppsContext";
import { AuthContext } from "../context/Auth/AuthContext";
import { Can } from "../components/Can";
import openSocket from "../services/socket-io";
import api from "../services/api";

const useNavStyles = makeStyles((theme) => ({
	btn: {
		padding: 9,
		borderRadius: 8,
		color: theme.palette.text.secondary,
		transition: "background 0.15s, color 0.15s",
		"&:hover": {
			backgroundColor:
				theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
			color: theme.palette.primary.main,
		},
	},
	active: {
		color: theme.palette.primary.main,
		backgroundColor:
			theme.palette.type === "dark" ? "rgba(0,168,132,0.12)" : "rgba(0,128,105,0.10)",
	},
	divider: {
		width: 30,
		margin: "6px 0",
		backgroundColor:
			theme.palette.type === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
	},
}));

const NavBtn = ({ to, title, icon }) => {
	const classes = useNavStyles();
	const history = useHistory();
	const location = useLocation();
	const active = location.pathname.startsWith(to);

	return (
		<Tooltip title={title} placement="right">
			<IconButton
				size="small"
				className={`${classes.btn} ${active ? classes.active : ""}`}
				onClick={() => history.push(to)}
			>
				{icon}
			</IconButton>
		</Tooltip>
	);
};

const MainListItems = () => {
	const classes = useNavStyles();
	const { whatsApps } = useContext(WhatsAppsContext);
	const { user } = useContext(AuthContext);
	const [connectionWarning, setConnectionWarning] = useState(false);
	const [unreadTicketIds, setUnreadTicketIds] = useState(new Set());

	useEffect(() => {
		api.get("/tickets", { params: { withUnreadMessages: "true" } })
			.then(({ data }) => setUnreadTicketIds(new Set(data.tickets.map(t => t.id))))
			.catch(() => {});

		const socket = openSocket();
		socket.on("connect", () => socket.emit("joinNotification"));
		socket.on("appMessage", data => {
			if (data.action === "create" && !data.message.read)
				setUnreadTicketIds(prev => new Set([...prev, data.ticket.id]));
		});
		socket.on("ticket", data => {
			if (data.action === "updateUnread" || data.action === "delete")
				setUnreadTicketIds(prev => {
					const s = new Set(prev);
					s.delete(data.ticketId);
					return s;
				});
		});
		return () => socket.disconnect();
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (whatsApps.length > 0) {
				const offline = whatsApps.filter(w =>
					["qrcode", "PAIRING", "DISCONNECTED", "TIMEOUT", "OPENING"].includes(w.status)
				);
				setConnectionWarning(offline.length > 0);
			}
		}, 2000);
		return () => clearTimeout(timer);
	}, [whatsApps]);

	return (
		<>
			<NavBtn
				to="/connections"
				title={i18n.t("mainDrawer.listItems.connections")}
				icon={
					<Badge badgeContent={connectionWarning ? "!" : 0} color="error">
						<ArrowLeftRight size={18} />
					</Badge>
				}
			/>
			<NavBtn
				to="/tickets"
				title="Chats"
				icon={
					<Badge badgeContent={unreadTicketIds.size} color="secondary" max={99}>
						<WhatsAppIcon fontSize="small" />
					</Badge>
				}
			/>
			<NavBtn
				to="/contacts"
				title={i18n.t("mainDrawer.listItems.contacts")}
				icon={<Users size={18} />}
			/>
			<NavBtn
				to="/quickAnswers"
				title={i18n.t("mainDrawer.listItems.quickAnswers")}
				icon={<MessageSquare size={18} />}
			/>
			<Can
				role={user.profile}
				perform="drawer-admin-items:view"
				yes={() => (
					<>
						<Divider className={classes.divider} />
						<NavBtn
							to="/users"
							title={i18n.t("mainDrawer.listItems.users")}
							icon={<UserCog size={18} />}
						/>
						<NavBtn
							to="/Settings"
							title={i18n.t("mainDrawer.listItems.settings")}
							icon={<Settings size={18} />}
						/>
					</>
				)}
			/>
		</>
	);
};

export default MainListItems;
