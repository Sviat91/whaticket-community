# Plan: Optimistic UI for media send

## Goal
When user sends media, immediately show a "pending" bubble with local preview + clock icon.
POST runs in background. Socket echo removes pending bubble (FIFO).
No backend changes. Frontend only.

## Files to change

### 1. `frontend/src/components/Ticket/index.js`

Add `useRef` to React import.

Add state + ref:
```js
const [pendingMessages, setPendingMessages] = useState([]);
const pendingRef = useRef([]);
```

Add handlers (after existing drag handlers):
```js
const handleOptimisticSend = (msgs) => {
  pendingRef.current = [...pendingRef.current, ...msgs];
  setPendingMessages([...pendingRef.current]);
};

const handleClearOldestPending = () => {
  if (pendingRef.current.length === 0) return;
  pendingRef.current = pendingRef.current.slice(1);
  setPendingMessages([...pendingRef.current]);
};
```

Update JSX:
- `<MessageInput ... onOptimisticSend={handleOptimisticSend} />`
- `<MessagesList ... pendingMessages={pendingMessages} onFromMeMessage={handleClearOldestPending} />`

### 2. `frontend/src/components/MessageInput/index.js`

Add `onOptimisticSend` to props signature.

Rewrite `handleSendMessage` media branch only:
```js
if (medias.length > 0) {
  if (onOptimisticSend) {
    const pending = medias.map((file, i) => ({
      id: `pending-${Date.now()}-${i}`,
      body: i === medias.length - 1 ? inputMessage.trim() : "",
      fromMe: true,
      mediaType: file.type.split("/")[0],
      previewUrl: URL.createObjectURL(file),
    }));
    onOptimisticSend(pending);
  }

  const formData = new FormData();
  formData.append("fromMe", true);
  medias.forEach(media => formData.append("medias", media));
  formData.append("body", inputMessage.trim());

  // Clear UI immediately
  setInputMessage("");
  setShowEmoji(false);
  setLoading(false);
  setMedias([]);
  setReplyingMessage(null);

  // POST fire-and-forget
  api.post(`/messages/${ticketId}`, formData).catch(toastError);
  return;
}
```

Text branch stays exactly as is (await + setState at end of function).

### 3. `frontend/src/components/MessagesList/index.js`

#### Props signature:
```js
const MessagesList = ({ ticketId, isGroup, pendingMessages = [], onFromMeMessage }) => {
```

#### Socket handler — add `fromMe` check:
Inside `appMessage` handler, `data.action === "create"` block, after `scrollToBottom()`:
```js
if (data.message.fromMe && onFromMeMessage) {
  onFromMeMessage();
}
```

#### `renderDailyTimestamps` — remove the `index === messagesList.length - 1` case entirely.
That case returned `<div ref={lastMessageRef} ... />` — we move this ref to the JSX bottom.

#### JSX — inside `<div id="messagesList">`, after `renderMessages()`:
```jsx
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
<div ref={lastMessageRef} style={{ float: "left", clear: "both" }} />
```

## Checkboxes
- [x] Ticket/index.js: pendingMessages state + ref + handlers + pass props
- [x] MessageInput/index.js: onOptimisticSend prop + rewrite media branch
- [x] MessagesList/index.js: props + socket handler + renderDailyTimestamps + JSX
