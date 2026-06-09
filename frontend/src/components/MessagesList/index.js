import React, { useState, useEffect, useLayoutEffect, useReducer, useRef } from 'react';

import { isSameDay, parseISO, format } from "date-fns";
import openSocket from "../../services/socket-io";
import clsx from "clsx";

import { green } from "@material-ui/core/colors";
import {
  IconButton,
  makeStyles,
} from "@material-ui/core";
import Skeleton from "@material-ui/lab/Skeleton";
import {
  AccessTime,
  Block,
  Done,
  DoneAll,
  ExpandMore,
} from "@material-ui/icons";

import MarkdownWrapper from "../MarkdownWrapper";
import VcardPreview from "../VcardPreview";
import LocationPreview from "../LocationPreview";
import ModalImageCors from "../ModalImageCors";
import MessageOptionsMenu from "../MessageOptionsMenu";
import whatsBackground from "../../assets/wa-background.png";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import Audio from "../Audio";

const useStyles = makeStyles((theme) => ({
  messagesListWrapper: {
    overflow: "hidden",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
  },

  messagesList: {
    backgroundImage: theme.palette.type === "dark" ? "none" : `url(${whatsBackground})`,
    backgroundColor: theme.palette.type === "dark" ? "#0B141A" : "transparent",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    padding: "20px 20px 20px 20px",
    overflowY: "scroll",
    [theme.breakpoints.down("sm")]: {
      paddingBottom: "90px",
    },
    ...theme.scrollbarStyles,
  },

  messagesContent: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
  },

  messageLeft: {
    marginRight: 20,
    marginTop: 2,
    minWidth: 100,
    maxWidth: 260,
    width: 'fit-content',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    "&:hover #messageActionsButton": {
      display: "flex",
      position: "absolute",
      top: 0,
      right: 0,
    },

    whiteSpace: "pre-wrap",
    backgroundColor: theme.palette.type === "dark" ? "#202C33" : "#ffffff",
    color: theme.palette.text.primary,
    alignSelf: "flex-start",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingLeft: 5,
    paddingRight: 5,
    paddingTop: 5,
    paddingBottom: 0,
    boxShadow: theme.palette.type === "dark" ? "0 1px 1px #0a0f12" : "0 1px 1px #b3b3b3",
  },

  quotedContainerLeft: {
    margin: '-3px -6px 6px -6px',
    overflow: "hidden",
    backgroundColor: theme.palette.type === "dark" ? "#1A272F" : "#f0f0f0",
    borderRadius: "7.5px",
    display: "flex",
    position: "relative",
  },

  quotedMsg: {
    padding: 10,
    maxWidth: 300,
    height: "auto",
    display: "block",
    whiteSpace: "pre-wrap",
    overflow: "hidden",
  },

  quotedSideColorLeft: {
    flex: "none",
    width: "4px",
    backgroundColor: "#6bcbef",
  },

  messageRight: {
    marginLeft: 20,
    marginTop: 2,
    minWidth: 100,
    maxWidth: 260,
    width: 'fit-content',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    "&:hover #messageActionsButton": {
      display: "flex",
      position: "absolute",
      top: 0,
      right: 0,
    },

    whiteSpace: "pre-wrap",
    backgroundColor: theme.palette.type === "dark" ? "#005C4B" : "#dcf8c6",
    color: theme.palette.text.primary,
    alignSelf: "flex-end",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 0,
    paddingLeft: 5,
    paddingRight: 5,
    paddingTop: 5,
    paddingBottom: 0,
    boxShadow: theme.palette.type === "dark" ? "0 1px 1px #0a0f12" : "0 1px 1px #b3b3b3",
  },

  quotedContainerRight: {
    margin: '-3px -6px 6px -6px',
    overflowY: "hidden",
    backgroundColor: theme.palette.type === "dark" ? "#025144" : "#cfe9ba",
    borderRadius: "7.5px",
    display: "flex",
    position: "relative",
  },

  quotedMsgRight: {
    padding: 10,
    maxWidth: 300,
    height: "auto",
    whiteSpace: "pre-wrap",
  },

  quotedSideColorRight: {
    flex: "none",
    width: "4px",
    backgroundColor: "#35cd96",
  },

  messageActionsButton: {
    display: "none",
    position: "relative",
    color: "#999",
    zIndex: 1,
    backgroundColor: "inherit",
    opacity: "90%",
    "&:hover, &.Mui-focusVisible": { backgroundColor: "inherit" },
  },

  messageContactName: {
    display: "flex",
    color: "#6bcbef",
    fontWeight: 500,
  },

  textContentItem: {
    overflowWrap: 'break-word',
    padding: '3px 6px 6px 6px',
    '&::after': {
      content: '""',
      display: 'inline-block',
      width: 65,
      height: 0,
    },
  },

  textContentItemDeleted: {
    fontStyle: 'italic',
    color: 'rgba(0, 0, 0, 0.36)',
    overflowWrap: 'break-word',
    padding: '3px 6px 6px 6px',
    '&::after': {
      content: '""',
      display: 'inline-block',
      width: 65,
      height: 0,
    },
  },

  messageMedia: {
    objectFit: 'cover',
    width: 250,
    aspectRatio: '4/3',
    borderRadius: 8,
    display: 'block',
  },

  timestamp: {
    fontSize: 11,
    position: "absolute",
    bottom: 0,
    right: 5,
    color: "#999",
  },

  dailyTimestamp: {
    alignItems: "center",
    textAlign: "center",
    alignSelf: "center",
    width: "110px",
    backgroundColor: theme.palette.type === "dark" ? "#1F2C34" : "#e1f3fb",
    margin: "10px",
    borderRadius: "10px",
    boxShadow: "0 1px 1px #b3b3b3",
  },

  dailyTimestampText: {
    color: theme.palette.text.secondary,
    padding: 8,
    alignSelf: "center",
    marginLeft: "0px",
  },

  ackIcons: {
    fontSize: 18,
    verticalAlign: "middle",
    marginLeft: 4,
  },

  deletedIcon: {
    fontSize: 18,
    verticalAlign: "middle",
    marginRight: 4,
  },

  ackDoneAllIcon: {
    color: green[500],
    fontSize: 18,
    verticalAlign: "middle",
    marginLeft: 4,
  },

  docCard: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    textDecoration: "none",
    color: "inherit",
  },
  docIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: theme.palette.type === "dark" ? "#374045" : "#e0e0e0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  docExt: {
    fontSize: 10,
    fontWeight: 700,
    color: theme.palette.text.secondary,
    textTransform: "uppercase",
  },
  docName: {
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 170,
  },
}));

const messagesCache = new Map();
const CACHE_MAX_SIZE = 20;

const reducer = (state, action) => {
  if (action.type === 'RESTORE_CACHE') {
    return [...action.payload];
  }

  if (action.type === "LOAD_MESSAGES") {
    const messages = action.payload;
    const newMessages = [];

    messages.forEach((message) => {
      const messageIndex = state.findIndex((m) => m.id === message.id);
      if (messageIndex !== -1) {
        state[messageIndex] = message;
      } else {
        newMessages.push(message);
      }
    });

    return [...newMessages, ...state];
  }

  if (action.type === "ADD_MESSAGE") {
    const newMessage = action.payload;
    const messageIndex = state.findIndex((m) => m.id === newMessage.id);

    if (messageIndex !== -1) {
      state[messageIndex] = newMessage;
    } else {
      state.push(newMessage);
    }

    return [...state];
  }

  if (action.type === "UPDATE_MESSAGE") {
    const messageToUpdate = action.payload;
    const messageIndex = state.findIndex((m) => m.id === messageToUpdate.id);

    if (messageIndex !== -1) {
      state[messageIndex] = messageToUpdate;
    }

    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const MessagesList = ({ ticketId, isGroup, pendingMessages = [], onFromMeMessage }) => {
  const classes = useStyles();

  const [messagesList, dispatch] = useReducer(reducer, []);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastMessageRef = useRef();

  const [selectedMessage, setSelectedMessage] = useState({});
  const [anchorEl, setAnchorEl] = useState(null);
  const messageOptionsMenuOpen = Boolean(anchorEl);
  const currentTicketId = useRef(ticketId);
  const pendingScrollRef = useRef(false);
  const pendingScrollNewMsg = useRef(false);
  const scrollContainerRef = useRef(null);
  const shouldStickRef = useRef(true);

  useEffect(() => {
    currentTicketId.current = ticketId;
    shouldStickRef.current = true;
    setPageNumber(1);

    const cached = messagesCache.get(String(ticketId));
    if (cached) {
      pendingScrollRef.current = true;
      dispatch({ type: 'RESTORE_CACHE', payload: cached });
    } else {
      pendingScrollRef.current = false;
      dispatch({ type: 'RESET' });
    }
  }, [ticketId]);

  useEffect(() => {
    const hasCached = pageNumber === 1 && messagesCache.has(String(ticketId));
    if (!hasCached) setLoading(true);

    const delayDebounceFn = setTimeout(() => {
      const fetchMessages = async () => {
        try {
          const { data } = await api.get('/messages/' + ticketId, {
            params: { pageNumber },
          });

          if (currentTicketId.current === ticketId) {
            if (pageNumber === 1 && data.messages.length > 0 && !hasCached) {
              pendingScrollRef.current = true;
            }
            dispatch({ type: 'LOAD_MESSAGES', payload: data.messages });
            setHasMore(data.hasMore);
            setLoading(false);

            if (pageNumber === 1) {
              messagesCache.set(String(ticketId), data.messages);
              if (messagesCache.size > CACHE_MAX_SIZE) {
                messagesCache.delete(messagesCache.keys().next().value);
              }
            }
          }
        } catch (err) {
          setLoading(false);
          toastError(err);
        }
      };
      fetchMessages();
    }, 500);
    return () => {
      clearTimeout(delayDebounceFn);
    };
  }, [pageNumber, ticketId]);

  useEffect(() => {
    const socket = openSocket();

    socket.on("connect", () => socket.emit("joinChatBox", ticketId));

    socket.on('appMessage', (data) => {
      if (data.action === 'create') {
        pendingScrollNewMsg.current = true;
        dispatch({ type: 'ADD_MESSAGE', payload: data.message });
        if (data.message.fromMe && onFromMeMessage) {
          onFromMeMessage();
        }
        if (
          String(data.message.ticketId) === String(ticketId) &&
          document.visibilityState === 'visible'
        ) {
          api.put('/messages/' + ticketId).catch(() => {});
        }

        const msgTicketKey = String(data.message.ticketId);
        const cached = messagesCache.get(msgTicketKey);
        if (cached) {
          const exists = cached.some((m) => m.id === data.message.id);
          if (!exists) messagesCache.set(msgTicketKey, [...cached, data.message]);
        }
      }

      if (data.action === 'update') {
        dispatch({ type: 'UPDATE_MESSAGE', payload: data.message });
      }
    });

    return () => {
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const loadMore = () => {
    setPageNumber((prevPageNumber) => prevPageNumber + 1);
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  useLayoutEffect(() => {
    if (pendingScrollRef.current && messagesList.length > 0) {
      pendingScrollRef.current = false;
      pendingScrollNewMsg.current = false;
      shouldStickRef.current = true;
      scrollToBottom();
    } else if (pendingScrollNewMsg.current) {
      pendingScrollNewMsg.current = false;
      if (shouldStickRef.current) scrollToBottom();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesList]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    shouldStickRef.current = scrollHeight - scrollTop - clientHeight < 80;

    if (!hasMore) return;

    if (scrollTop === 0) {
      document.getElementById("messagesList").scrollTop = 1;
    }

    if (loading) {
      return;
    }

    if (scrollTop < 50) {
      loadMore();
    }
  };

  const handleOpenMessageOptionsMenu = (e, message) => {
    setAnchorEl(e.currentTarget);
    setSelectedMessage(message);
  };

  const handleCloseMessageOptionsMenu = (e) => {
    setAnchorEl(null);
  };

  const checkMessageMedia = (message) => {
    if (message.mediaType === "location" && message.body.split('|').length >= 2) {
      let locationParts = message.body.split('|')
      let imageLocation = locationParts[0]
      let linkLocation = locationParts[1]

      let descriptionLocation = null

      if (locationParts.length > 2)
        descriptionLocation = message.body.split('|')[2]

      return <LocationPreview image={imageLocation} link={linkLocation} description={descriptionLocation} />
    }
    else if (message.mediaType === "vcard") {
      //console.log("vcard")
      //console.log(message)
      let array = message.body.split("\n");
      let obj = [];
      let contact = "";
      for (let index = 0; index < array.length; index++) {
        const v = array[index];
        let values = v.split(":");
        for (let ind = 0; ind < values.length; ind++) {
          if (values[ind].indexOf("+") !== -1) {
            obj.push({ number: values[ind] });
          }
          if (values[ind].indexOf("FN") !== -1) {
            contact = values[ind + 1];
          }
        }
      }
      return <VcardPreview contact={contact} numbers={obj[0]?.number} />
    }
    /*else if (message.mediaType === "multi_vcard") {
      console.log("multi_vcard")
      console.log(message)
    	
      if(message.body !== null && message.body !== "") {
        let newBody = JSON.parse(message.body)
        return (
          <>
            {
            newBody.map(v => (
              <VcardPreview contact={v.name} numbers={v.number} />
            ))
            }
          </>
        )
      } else return (<></>)
    }*/
    else if ( /^.*\.(jpe?g|png|gif)?$/i.exec(message.mediaUrl) && message.mediaType === "image") {
      return <ModalImageCors imageUrl={message.mediaUrl} />;
    } else if (message.mediaType === "audio") {
      return <Audio url={message.mediaUrl} />
    } else if (message.mediaType === "video") {
      return (
        <video
          className={classes.messageMedia}
          src={message.mediaUrl}
          controls
        />
      );
    } else {
      const filename = message.mediaUrl?.split('/').pop() || 'File';
      const ext = filename.split('.').pop()?.toUpperCase() || 'FILE';
      return (
        <a
          href={message.mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={classes.docCard}
        >
          <div className={classes.docIconBadge}>
            <span className={classes.docExt}>{ext}</span>
          </div>
          <span className={classes.docName}>{filename}</span>
        </a>
      );
    }
  };

  const renderMessageAck = (message) => {
    if (message.ack === 0) {
      return <AccessTime fontSize="small" className={classes.ackIcons} />;
    }
    if (message.ack === 1) {
      return <Done fontSize="small" className={classes.ackIcons} />;
    }
    if (message.ack === 2) {
      return <DoneAll fontSize="small" className={classes.ackIcons} />;
    }
    if (message.ack === 3 || message.ack === 4) {
      return <DoneAll fontSize="small" className={classes.ackDoneAllIcon} />;
    }
  };

  const renderDailyTimestamps = (message, index) => {
    if (index === 0) {
      return (
        <span
          className={classes.dailyTimestamp}
          key={`timestamp-${message.id}`}
        >
          <div className={classes.dailyTimestampText}>
            {format(parseISO(messagesList[index].createdAt), "dd/MM/yyyy")}
          </div>
        </span>
      );
    }
    if (index < messagesList.length - 1) {
      let messageDay = parseISO(messagesList[index].createdAt);
      let previousMessageDay = parseISO(messagesList[index - 1].createdAt);

      if (!isSameDay(messageDay, previousMessageDay)) {
        return (
          <span
            className={classes.dailyTimestamp}
            key={`timestamp-${message.id}`}
          >
            <div className={classes.dailyTimestampText}>
              {format(parseISO(messagesList[index].createdAt), "dd/MM/yyyy")}
            </div>
          </span>
        );
      }
    }
  };

  const renderMessageDivider = (message, index) => {
    if (index < messagesList.length && index > 0) {
      let messageUser = messagesList[index].fromMe;
      let previousMessageUser = messagesList[index - 1].fromMe;

      if (messageUser !== previousMessageUser) {
        return (
          <span style={{ marginTop: 16 }} key={`divider-${message.id}`}></span>
        );
      }
    }
  };

  const renderQuotedMessage = (message) => {
    return (
      <div
        className={clsx(classes.quotedContainerLeft, {
          [classes.quotedContainerRight]: message.fromMe,
        })}
      >
        <span
          className={clsx(classes.quotedSideColorLeft, {
            [classes.quotedSideColorRight]: message.quotedMsg?.fromMe,
          })}
        ></span>
        <div className={classes.quotedMsg}>
          {!message.quotedMsg?.fromMe && (
            <span className={classes.messageContactName}>
              {message.quotedMsg?.contact?.name}
            </span>
          )}
          {message.quotedMsg?.body}
        </div>
      </div>
    );
  };

  const renderMessages = () => {
    if (messagesList.length > 0) {
      const viewMessagesList = messagesList.map((message, index) => {
        if (!message.fromMe) {
          return (
            <React.Fragment key={message.id}>
              {renderDailyTimestamps(message, index)}
              {renderMessageDivider(message, index)}
              <div className={classes.messageLeft}>
                <IconButton
                  variant="contained"
                  size="small"
                  id="messageActionsButton"
                  disabled={message.isDeleted}
                  className={classes.messageActionsButton}
                  onClick={(e) => handleOpenMessageOptionsMenu(e, message)}
                >
                  <ExpandMore />
                </IconButton>
                {isGroup && (
                  <span className={classes.messageContactName}>
                    {message.contact?.name}
                  </span>
                )}
                {(message.mediaUrl || message.mediaType === "location" || message.mediaType === "vcard"
                  //|| message.mediaType === "multi_vcard" 
                ) && checkMessageMedia(message)}
                <div className={classes.textContentItem}>
                  {message.quotedMsg && renderQuotedMessage(message)}
                  {message.body && <MarkdownWrapper>{message.body}</MarkdownWrapper>}
                  <span className={classes.timestamp}>
                    {format(parseISO(message.createdAt), "HH:mm")}
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        } else {
          return (
            <React.Fragment key={message.id}>
              {renderDailyTimestamps(message, index)}
              {renderMessageDivider(message, index)}
              <div className={classes.messageRight}>
                <IconButton
                  variant="contained"
                  size="small"
                  id="messageActionsButton"
                  disabled={message.isDeleted}
                  className={classes.messageActionsButton}
                  onClick={(e) => handleOpenMessageOptionsMenu(e, message)}
                >
                  <ExpandMore />
                </IconButton>
                {(message.mediaUrl || message.mediaType === "location" || message.mediaType === "vcard"
                  //|| message.mediaType === "multi_vcard" 
                ) && checkMessageMedia(message)}
                <div
                  className={clsx(classes.textContentItem, {
                    [classes.textContentItemDeleted]: message.isDeleted,
                  })}
                >
                  {message.isDeleted && (
                    <Block
                      color="disabled"
                      fontSize="small"
                      className={classes.deletedIcon}
                    />
                  )}
                  {message.quotedMsg && renderQuotedMessage(message)}
                  {message.body && <MarkdownWrapper>{message.body}</MarkdownWrapper>}
                  <span className={classes.timestamp}>
                    {format(parseISO(message.createdAt), "HH:mm")}
                    {renderMessageAck(message)}
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        }
      });
      return viewMessagesList;
    } else {
      return <div>Say hello to your new contact!</div>;
    }
  };

  return (
    <div className={classes.messagesListWrapper}>
      <MessageOptionsMenu
        message={selectedMessage}
        anchorEl={anchorEl}
        menuOpen={messageOptionsMenuOpen}
        handleClose={handleCloseMessageOptionsMenu}
      />
      <div
        id='messagesList'
        ref={scrollContainerRef}
        className={classes.messagesList}
        onScroll={handleScroll}
      >
        <div className={classes.messagesContent}>
        {messagesList.length > 0 ? renderMessages() : []}
        {pendingMessages.map(msg => (
          <div key={msg.id} className={classes.messageRight} style={{ opacity: 0.65 }}>
            {msg.mediaType === "image" && (
              <img src={msg.previewUrl} className={classes.messageMedia} alt="" />
            )}
            <div className={classes.textContentItem}>
              {msg.body && <MarkdownWrapper>{msg.body}</MarkdownWrapper>}
              <span className={classes.timestamp}>
                <AccessTime fontSize="small" className={classes.ackIcons} />
              </span>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ padding: "0 0 12px 0" }}>
            {[
              { fromMe: false, w: 180 },
              { fromMe: true,  w: 240 },
              { fromMe: false, w: 130 },
              { fromMe: true,  w: 200 },
              { fromMe: false, w: 160 },
              { fromMe: true,  w: 110 },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: item.fromMe ? "flex-end" : "flex-start",
                marginBottom: 6,
              }}>
                <Skeleton
                  variant="rect"
                  width={item.w}
                  height={36}
                  style={{ borderRadius: item.fromMe ? "8px 8px 0 8px" : "0 8px 8px 8px" }}
                />
              </div>
            ))}
          </div>
        )}
        <div ref={lastMessageRef} style={{ float: "left", clear: "both" }} />
        </div>
      </div>
    </div>
  );
};

export default MessagesList;