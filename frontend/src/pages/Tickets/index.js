import React from "react";
import { useParams } from "react-router-dom";
import Paper from "@material-ui/core/Paper";
import { makeStyles } from "@material-ui/core/styles";

import TicketsManager from "../../components/TicketsManager/";
import Ticket from "../../components/Ticket/";

import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  chatContainer: {
    flex: 1,
    // // backgroundColor: "#eee",
    // padding: theme.spacing(4),
    height: "100%",
    overflowY: "hidden",
    backgroundColor: theme.palette.background.default,
  },

  chatPapper: {
    display: "flex",
    height: "100%",
    backgroundColor: theme.palette.background.default,
  },

  welcomeMsg: {
    backgroundColor: theme.palette.background.paper,
    display: "flex",
    justifyContent: "space-evenly",
    alignItems: "center",
    height: "100%",
    textAlign: "center",
    borderRadius: 0,
  },
}));

const Chat = () => {
  const classes = useStyles();
  const { ticketId } = useParams();

  return (
    <div className={classes.chatContainer}>
      <div className={classes.chatPapper}>
        <div style={{ display: "flex", height: "100%", width: "100%" }}>
          <div style={{
            width: 360,
            minWidth: 360,
            flexShrink: 0,
            overflow: "hidden",
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}>
            <TicketsManager />
          </div>
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {ticketId ? <Ticket /> : (
              <Paper className={classes.welcomeMsg}>
                <span>{i18n.t("chat.noTicketMessage")}</span>
              </Paper>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
