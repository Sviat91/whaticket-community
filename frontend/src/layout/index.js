import React, { useState, useContext } from "react";
import { makeStyles, Avatar, Tooltip, IconButton } from "@material-ui/core";
import ExitToAppIcon from "@material-ui/icons/ExitToApp";

import MainListItems from "./MainListItems";
import NotificationsPopOver from "../components/NotificationsPopOver";
import UserModal from "../components/UserModal";
import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";
import { useThemeContext } from "../context/DarkMode";

const useStyles = makeStyles((theme) => ({
	root: {
		display: "flex",
		height: "100vh",
		overflow: "hidden",
		backgroundColor: theme.palette.background.default,
	},
	rail: {
		width: 60,
		flexShrink: 0,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		paddingTop: theme.spacing(1.5),
		paddingBottom: theme.spacing(1.5),
		backgroundColor: theme.palette.background.paper,
		borderRight: `1px solid ${
			theme.palette.type === "dark" ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"
		}`,
	},
	userAvatar: {
		width: 36,
		height: 36,
		cursor: "pointer",
		fontSize: 15,
		marginBottom: theme.spacing(1),
		backgroundColor: theme.palette.primary.main,
		transition: "opacity 0.2s",
		"&:hover": { opacity: 0.8 },
	},
	navItems: {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		paddingTop: theme.spacing(1),
		gap: 4,
	},
	railBottom: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 4,
	},
	themeToggle: {
		width: 36,
		height: 28,
		objectFit: "contain",
		cursor: "pointer",
		borderRadius: 4,
		opacity: 0.8,
		"&:hover": { opacity: 1 },
	},
	logoutBtn: {
		padding: 9,
		color: theme.palette.text.secondary,
		"&:hover": { color: theme.palette.error.main },
	},
	content: {
		flex: 1,
		overflow: "hidden",
		display: "flex",
		flexDirection: "column",
	},
}));

const LoggedInLayout = ({ children }) => {
	const classes = useStyles();
	const [userModalOpen, setUserModalOpen] = useState(false);
	const { handleLogout, loading, user } = useContext(AuthContext);
	const { darkMode, toggleTheme } = useThemeContext();

	if (loading) return <BackdropLoading />;

	return (
		<div className={classes.root}>
			<NotificationsPopOver />
			<UserModal
				open={userModalOpen}
				onClose={() => setUserModalOpen(false)}
				userId={user?.id}
			/>

			<nav className={classes.rail}>
				<Tooltip title={user?.name || "Profile"} placement="right">
					<Avatar
						className={classes.userAvatar}
						onClick={() => setUserModalOpen(true)}
					>
						{user?.name?.[0]?.toUpperCase()}
					</Avatar>
				</Tooltip>

				<div className={classes.navItems}>
					<MainListItems />
				</div>

				<div className={classes.railBottom}>
					<Tooltip title={darkMode ? "Light mode" : "Dark mode"} placement="right">
						<img
							src={darkMode ? "/Dark.png" : "/Light.png"}
							alt="toggle theme"
							onClick={toggleTheme}
							className={classes.themeToggle}
						/>
					</Tooltip>
					<Tooltip title="Logout" placement="right">
						<IconButton
							size="small"
							className={classes.logoutBtn}
							onClick={handleLogout}
						>
							<ExitToAppIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</div>
			</nav>

			<main className={classes.content}>
				{children}
			</main>
		</div>
	);
};

export default LoggedInLayout;
