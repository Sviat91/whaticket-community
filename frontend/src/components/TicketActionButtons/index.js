import React, { useState } from "react";

import { makeStyles } from "@material-ui/core/styles";
import { IconButton } from "@material-ui/core";
import { MoreVert } from "@material-ui/icons";

import TicketOptionsMenu from "../TicketOptionsMenu";

const useStyles = makeStyles(theme => ({
	actionButtons: {
		marginRight: 6,
		flex: "none",
		alignSelf: "center",
		marginLeft: "auto",
		"& > *": {
			margin: theme.spacing(1),
		},
	},
}));

const TicketActionButtons = ({ ticket }) => {
	const classes = useStyles();
	const [anchorEl, setAnchorEl] = useState(null);
	const ticketOptionsMenuOpen = Boolean(anchorEl);

	const handleOpenTicketOptionsMenu = e => {
		setAnchorEl(e.currentTarget);
	};

	const handleCloseTicketOptionsMenu = e => {
		setAnchorEl(null);
	};

	return (
		<div className={classes.actionButtons}>
			<IconButton onClick={handleOpenTicketOptionsMenu}>
				<MoreVert />
			</IconButton>
			<TicketOptionsMenu
				ticket={ticket}
				anchorEl={anchorEl}
				menuOpen={ticketOptionsMenuOpen}
				handleClose={handleCloseTicketOptionsMenu}
			/>
		</div>
	);
};

export default TicketActionButtons;
