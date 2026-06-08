import React, { useContext, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import InputBase from "@material-ui/core/InputBase";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import { SquarePen, MoreVertical, Search } from "lucide-react";

import NewTicketModal from "../NewTicketModal";
import TicketsList from "../TicketsList";
import { AuthContext } from "../../context/Auth/AuthContext";
import TicketsQueueSelect from "../TicketsQueueSelect";

const useStyles = makeStyles((theme) => ({
  ticketsWrapper: {
    position: "relative",
    display: "flex",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: theme.palette.background.paper,
    borderRight: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px 6px 16px",
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: 16,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
  },
  searchBar: {
    display: "flex",
    alignItems: "center",
    backgroundColor: theme.palette.background.paper,
    borderRadius: 8,
    margin: "0 12px 8px 12px",
    padding: "4px 10px",
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: theme.palette.text.primary,
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 12px 8px 12px",
    flexShrink: 0,
  },
  chip: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 16,
    padding: "4px 14px",
    fontSize: 13,
    cursor: "pointer",
    background: "transparent",
    color: theme.palette.text.secondary,
    fontFamily: "inherit",
    outline: "none",
  },
  chipActive: {
    border: "none",
    borderRadius: 16,
    padding: "4px 14px",
    fontSize: 13,
    cursor: "pointer",
    backgroundColor: theme.palette.primary.main,
    color: "#fff",
    fontFamily: "inherit",
    outline: "none",
  },
}));

const TicketsManager = () => {
  const classes = useStyles();
  const [searchParam, setSearchParam] = useState("");
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const searchInputRef = useRef();
  const { user } = useContext(AuthContext);
  const userQueueIds = user.queues.map((q) => q.id);
  const [selectedQueueIds, setSelectedQueueIds] = useState(userQueueIds || []);

  let searchTimeout;

  const handleSearch = (e) => {
    const searchedTerm = e.target.value.toLowerCase();
    clearTimeout(searchTimeout);
    if (searchedTerm === "") {
      setSearchParam(searchedTerm);
      return;
    }
    searchTimeout = setTimeout(() => {
      setSearchParam(searchedTerm);
    }, 500);
  };

  const openMenu = (e) => setMenuAnchor(e.currentTarget);
  const closeMenu = () => setMenuAnchor(null);

  return (
    <Paper elevation={0} className={classes.ticketsWrapper}>
      <NewTicketModal
        modalOpen={newTicketModalOpen}
        onClose={() => setNewTicketModalOpen(false)}
      />

      <div className={classes.header}>
        <Typography className={classes.headerTitle}>Chats</Typography>
        <div className={classes.headerActions}>
          <IconButton size="small" onClick={() => setNewTicketModalOpen(true)}>
            <SquarePen size={20} />
          </IconButton>
          <IconButton size="small" onClick={openMenu}>
            <MoreVertical size={20} />
          </IconButton>
        </div>
      </div>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        getContentAnchorEl={null}
      >
        <MenuItem disableGutters>
          <TicketsQueueSelect
            selectedQueueIds={selectedQueueIds}
            userQueues={user?.queues}
            onChange={(values) => setSelectedQueueIds(values)}
          />
        </MenuItem>
      </Menu>

      <div className={classes.searchBar}>
        <Search size={16} color="grey" />
        <InputBase
          className={classes.searchInput}
          inputRef={searchInputRef}
          placeholder="Search or start new chat"
          onChange={handleSearch}
        />
      </div>

      <div className={classes.filterRow}>
        <button
          className={!filterUnread ? classes.chipActive : classes.chip}
          onClick={() => setFilterUnread(false)}
        >
          All
        </button>
        <button
          className={filterUnread ? classes.chipActive : classes.chip}
          onClick={() => setFilterUnread(true)}
        >
          Unread
        </button>
      </div>

      {searchParam ? (
        <TicketsList
          searchParam={searchParam}
          showAll={true}
          selectedQueueIds={selectedQueueIds}
        />
      ) : (
        <TicketsList
          status="open"
          showAll={true}
          selectedQueueIds={selectedQueueIds}
          withUnreadMessages={filterUnread ? "true" : undefined}
        />
      )}
    </Paper>
  );
};

export default TicketsManager;
