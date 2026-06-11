# Plan: Show media preview in quoted message bubbles

## Problem

Two components render quoted messages but only show `body` text.
For media messages (photo, audio, video, document) where body is empty, this renders only the
contact name — no thumbnail, no type indicator.

## Files to change

### File 1: `frontend/src/components/MessagesList/index.js`

Function `renderQuotedMessage`, lines ~672-679.

Replace:
```jsx
<div className={classes.quotedMsg}>
  {!message.quotedMsg?.fromMe && (
    <span className={classes.messageContactName}>
      {message.quotedMsg?.contact?.name}
    </span>
  )}
  {message.quotedMsg?.body}
</div>
```

With:
```jsx
<div className={classes.quotedMsg}>
  {!message.quotedMsg?.fromMe && (
    <span className={classes.messageContactName}>
      {message.quotedMsg?.contact?.name}
    </span>
  )}
  {message.quotedMsg?.mediaUrl ? (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {message.quotedMsg.mediaType === "image" && (
        <img
          src={message.quotedMsg.mediaUrl}
          alt=""
          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
        />
      )}
      <span style={{ opacity: 0.8, fontSize: "0.85em" }}>
        {message.quotedMsg.mediaType === "image"
          ? message.quotedMsg.body || "Photo"
          : message.quotedMsg.mediaType === "audio"
          ? "Audio"
          : message.quotedMsg.mediaType === "video"
          ? "Video"
          : message.quotedMsg.body || "Document"}
      </span>
    </div>
  ) : (
    message.quotedMsg?.body
  )}
</div>
```

---

### File 2: `frontend/src/components/MessageInput/index.js`

Function `renderReplyingMessage`, lines ~443-450.

Replace:
```jsx
<div className={classes.replyginMsgBody}>
  {!message.fromMe && (
    <span className={classes.messageContactName}>
      {message.contact?.name}
    </span>
  )}
  {message.body}
</div>
```

With:
```jsx
<div className={classes.replyginMsgBody}>
  {!message.fromMe && (
    <span className={classes.messageContactName}>
      {message.contact?.name}
    </span>
  )}
  {message.mediaUrl ? (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {message.mediaType === "image" && (
        <img
          src={message.mediaUrl}
          alt=""
          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
        />
      )}
      <span style={{ opacity: 0.8, fontSize: "0.85em" }}>
        {message.mediaType === "image"
          ? message.body || "Photo"
          : message.mediaType === "audio"
          ? "Audio"
          : message.mediaType === "video"
          ? "Video"
          : message.body || "Document"}
      </span>
    </div>
  ) : (
    message.body
  )}
</div>
```

---

## After changes

```bash
cd /Users/sviat/whaticket/frontend && npm run build 2>&1 | tail -10
```

Must pass with 0 errors/warnings about JSX.
