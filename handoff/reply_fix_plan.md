# Plan: Fix Reply (Quoted Message) Feature

## Root cause
wwebjs `sendMessage` with `quotedMessageId` does an internal `Msg.get(serializedId)` (cache) then
`Msg.getMessagesById([serializedId])` (server). Both can fail → sends without quote silently
(`ignoreQuoteErrors: true`). Fix: prime the local cache via `chat.fetchMessages({ limit: 50 })`
before calling `wbot.sendMessage` — same pattern as `deleteMessage` in this codebase.

Secondary bugs:
- `sendMedia` passes raw (unserialized) `quotedMessageId` to wwebjs
- Frontend doesn't include `quotedMsg` in FormData for media sends
- `SendWhatsAppMedia` service has no `quotedMsg` parameter

## 5 files to change

---

### File 1: `backend/src/providers/WhatsApp/types/ProviderOptions.ts`

Add `quotedMessageFromMe` to `SendMediaOptions`:

FROM:
```typescript
export interface SendMediaOptions {
  caption?: string;
  sendAudioAsVoice?: boolean;
  sendMediaAsDocument?: boolean;
  quotedMessageId?: string;
}
```
TO:
```typescript
export interface SendMediaOptions {
  caption?: string;
  sendAudioAsVoice?: boolean;
  sendMediaAsDocument?: boolean;
  quotedMessageId?: string;
  quotedMessageFromMe?: boolean;
}
```

---

### File 2: `backend/src/providers/WhatsApp/Implementations/wwebjs.ts`

#### Change A — `sendMessage` function (~line 321)

Replace:
```typescript
  const quotedMsgSerializedId = options?.quotedMessageId
    ? getSerializedMessageId(
        to,
        Boolean(options?.quotedMessageFromMe),
        options?.quotedMessageId
      )
    : "";

  const sentMessage = await wbot.sendMessage(to, body, {
    quotedMessageId: quotedMsgSerializedId,
    linkPreview: options?.linkPreview
  });
```

With:
```typescript
  const quotedMsgSerializedId = options?.quotedMessageId
    ? getSerializedMessageId(
        to,
        Boolean(options?.quotedMessageFromMe),
        options?.quotedMessageId
      )
    : undefined;

  if (quotedMsgSerializedId) {
    const inCache = await wbot.getMessageById(quotedMsgSerializedId);
    if (!inCache) {
      const chat = await wbot.getChatById(to);
      await chat.fetchMessages({ limit: 50 });
    }
  }

  const sentMessage = await wbot.sendMessage(to, body, {
    quotedMessageId: quotedMsgSerializedId,
    linkPreview: options?.linkPreview
  });
```

#### Change B — `sendMedia` function (~line 345)

In `sendMedia`, find where `mediaOptions` is constructed and `quotedMessageId: options?.quotedMessageId` is set.

Replace the full `mediaOptions` block and the `wbot.sendMessage` call:

FROM:
```typescript
  const mediaOptions: MessageSendOptions = {
    caption: options?.caption,
    sendAudioAsVoice: options?.sendAudioAsVoice,
    quotedMessageId: options?.quotedMessageId
  };

  if (
    messageMedia.mimetype.startsWith("image/") &&
    !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
  ) {
    mediaOptions.sendMediaAsDocument = options?.sendMediaAsDocument || true;
  }

  const sentMessage = await wbot.sendMessage(to, messageMedia, mediaOptions);
```

TO:
```typescript
  const quotedMediaSerializedId = options?.quotedMessageId
    ? getSerializedMessageId(
        to,
        Boolean(options?.quotedMessageFromMe),
        options.quotedMessageId
      )
    : undefined;

  if (quotedMediaSerializedId) {
    const inCache = await wbot.getMessageById(quotedMediaSerializedId);
    if (!inCache) {
      const chat = await wbot.getChatById(to);
      await chat.fetchMessages({ limit: 50 });
    }
  }

  const mediaOptions: MessageSendOptions = {
    caption: options?.caption,
    sendAudioAsVoice: options?.sendAudioAsVoice,
    quotedMessageId: quotedMediaSerializedId
  };

  if (
    messageMedia.mimetype.startsWith("image/") &&
    !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
  ) {
    mediaOptions.sendMediaAsDocument = options?.sendMediaAsDocument || true;
  }

  const sentMessage = await wbot.sendMessage(to, messageMedia, mediaOptions);
```

---

### File 3: `backend/src/services/WbotServices/SendWhatsAppMedia.ts`

FROM:
```typescript
interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
}

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body
}: Request): Promise<ProviderMessage> => {
```
...
```typescript
    const mediaOptions = {
      caption: hasBody,
      sendAudioAsVoice: true,
      sendMediaAsDocument:
        media.mimetype.startsWith("image/") &&
        !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
    };

    const sentMessage = await whatsappProvider.sendMedia(
      ticket.whatsappId,
      chatId,
      mediaInput,
      mediaOptions
    );
```

TO:
```typescript
interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
  quotedMsg?: Message;
}

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body,
  quotedMsg
}: Request): Promise<ProviderMessage> => {
```
...
```typescript
    const mediaOptions = {
      caption: hasBody,
      sendAudioAsVoice: true,
      sendMediaAsDocument:
        media.mimetype.startsWith("image/") &&
        !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename),
      quotedMessageId: quotedMsg?.id,
      quotedMessageFromMe: quotedMsg?.fromMe
    };

    const sentMessage = await whatsappProvider.sendMedia(
      ticket.whatsappId,
      chatId,
      mediaInput,
      mediaOptions
    );
```

---

### File 4: `backend/src/controllers/MessageController.ts`

In `store` handler, add quotedMsg parsing for FormData (it arrives as JSON string in multipart):

FROM:
```typescript
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  const ticket = await ShowTicketService(ticketId);

  SetTicketMessagesAsRead(ticket);

  if (medias) {
    await Promise.all(
      medias.map(async (media: Express.Multer.File) => {
        await SendWhatsAppMedia({ media, ticket, body });
      })
    );
  } else {
    await SendWhatsAppMessage({ body, ticket, quotedMsg });
  }
```

TO:
```typescript
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  const rawQuotedMsg = req.body.quotedMsg;
  const quotedMsg: Message | undefined = rawQuotedMsg
    ? (typeof rawQuotedMsg === "string" ? JSON.parse(rawQuotedMsg) : rawQuotedMsg)
    : undefined;

  const ticket = await ShowTicketService(ticketId);

  SetTicketMessagesAsRead(ticket);

  if (medias) {
    await Promise.all(
      medias.map(async (media: Express.Multer.File) => {
        await SendWhatsAppMedia({ media, ticket, body, quotedMsg });
      })
    );
  } else {
    await SendWhatsAppMessage({ body, ticket, quotedMsg });
  }
```

---

### File 5: `frontend/src/components/MessageInput/index.js`

In `handleSendMessage`, capture `replyingMessage` before UI clear, and append to FormData:

FROM:
```js
  const handleSendMessage = async () => {
    if (inputMessage.trim() === "" && medias.length === 0) return;
    setLoading(true);

    try {
      if (medias.length > 0) {
        if (onOptimisticSend) {
          const pending = medias.map((file, i) => ({
```

TO:
```js
  const handleSendMessage = async () => {
    if (inputMessage.trim() === "" && medias.length === 0) return;
    setLoading(true);
    const quotedMsgSnapshot = replyingMessage;

    try {
      if (medias.length > 0) {
        if (onOptimisticSend) {
          const pending = medias.map((file, i) => ({
```

And in the FormData block, after `formData.append("body", inputMessage.trim());` add:
```js
        if (quotedMsgSnapshot) {
          formData.append("quotedMsg", JSON.stringify(quotedMsgSnapshot));
        }
```

The existing `setReplyingMessage(null)` call stays where it is (after the formData construction, before the API call).

---

## After all changes

Run:
```bash
cd /Users/sviat/whaticket/backend && npm run build 2>&1 | tail -5
cd /Users/sviat/whaticket/frontend && npm run build 2>&1 | tail -5
```

Both must pass with 0 errors.
