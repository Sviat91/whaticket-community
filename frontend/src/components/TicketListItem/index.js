import React from "react";

import { useHistory, useParams } from "react-router-dom";
import { parseISO, format, isSameDay } from "date-fns";

import { makeStyles } from "@material-ui/core/styles";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import Typography from "@material-ui/core/Typography";
import Avatar from "@material-ui/core/Avatar";

import MarkdownWrapper from "../MarkdownWrapper";

const mediaExtensions = /\.(jpg|jpeg|png|gif|webp|mp4|mp3|ogg|pdf|docx?|xlsx?|zip|opus|aac|wav)(\.\w+)?$/i;

const useStyles = makeStyles(theme => ({
	ticket: {
		position: "relative",
	},

	noTicketsDiv: {
		display: "flex",
		height: "100px",
		margin: 40,
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
	},

	noTicketsText: {
		textAlign: "center",
		color: "rgb(104, 121, 146)",
		fontSize: "14px",
		lineHeight: "1.4",
	},

	noTicketsTitle: {
		textAlign: "center",
		fontSize: "16px",
		fontWeight: "600",
		margin: "0px",
	},

	contactNameWrapper: {
		display: "flex",
		justifyContent: "space-between",
	},

	lastMessageTime: {
		justifySelf: "flex-end",
		flexShrink: 0,
	},

	contactLastMessage: {
		paddingRight: 8,
		flex: 1,
		minWidth: 0,
	},

	unreadBadge: {
		alignSelf: "center",
		marginLeft: "auto",
		flexShrink: 0,
		backgroundColor: "#25D366",
		color: "white",
		borderRadius: 10,
		minWidth: 20,
		height: 20,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: 11,
		fontWeight: "bold",
		padding: "0 4px",
	},
}));

const TicketListItem = ({ ticket }) => {
	const classes = useStyles();
	const history = useHistory();
	const { ticketId } = useParams();

	const handleSelectTicket = id => {
		history.push(`/tickets/${id}`);
	};

	const isMedia =
		ticket.lastMessage &&
		!ticket.lastMessage.includes(" ") &&
		mediaExtensions.test(ticket.lastMessage);

	return (
		<React.Fragment key={ticket.id}>
			<ListItem
				dense
				button
				onClick={() => handleSelectTicket(ticket.id)}
				selected={ticketId && +ticketId === ticket.id}
				className={classes.ticket}
			>
				<ListItemAvatar>
					<Avatar src={ticket?.contact?.profilePicUrl} />
				</ListItemAvatar>
				<ListItemText
					disableTypography
					primary={
						<span className={classes.contactNameWrapper}>
							<Typography
								noWrap
								component="span"
								variant="body2"
								color="textPrimary"
							>
								{ticket.contact.name}
							</Typography>
							{ticket.lastMessage && (
								<Typography
									className={classes.lastMessageTime}
									component="span"
									variant="body2"
									color="textSecondary"
								>
									{isSameDay(parseISO(ticket.updatedAt), new Date()) ? (
										<>{format(parseISO(ticket.updatedAt), "HH:mm")}</>
									) : (
										<>{format(parseISO(ticket.updatedAt), "dd/MM/yyyy")}</>
									)}
								</Typography>
							)}
						</span>
					}
					secondary={
						<span className={classes.contactNameWrapper}>
							<Typography
								className={classes.contactLastMessage}
								noWrap
								component="span"
								variant="body2"
								color="textSecondary"
							>
								{isMedia ? (
									"📷 Media"
								) : ticket.lastMessage ? (
									<MarkdownWrapper>{ticket.lastMessage}</MarkdownWrapper>
								) : (
									<br />
								)}
							</Typography>
							{ticket.unreadMessages > 0 && (
								<span className={classes.unreadBadge}>{ticket.unreadMessages}</span>
							)}
						</span>
					}
				/>
			</ListItem>
		</React.Fragment>
	);
};

export default TicketListItem;
