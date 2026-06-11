# Plan: Fix Reply — Use Real Serialized ID (v2)

## Root Cause (confirmed)

`sendMessage` and `sendMedia` construct the quoted message ID manually:
`getSerializedMessageId(to, fromMe, shortId)` → `"false_1234@c.us_XXXX"`

When `getMessageById(constructedId)` misses (LID addressing, group chats, recent wwebjs
versions that store messages under a different key), we call `chat.fetchMessages()` but then
still pass the same constructed ID to `wbot.sendMessage`. wwebjs looks up that constructed
ID in the browser cache via `Msg.get(constructedId)` → not found → `ignoreQuoteErrors: true`
→ sends without quote silently.

`deleteMessage` (line 466-474) already has the correct pattern:
1. `getMessageById(serializedId)` → if null →
2. `fetchMessages({ limit: 50 })` + `msgs.find(m => m.id.id === shortId)` →
3. Use the **real** `message.id._serialized` (whatever format WhatsApp actually stores).

## Fix: 1 file, 2 functions

File: `backend/src/providers/WhatsApp/Implementations/wwebjs.ts`

---

### Change A — `sendMessage` function (lines 329-351)

Replace the existing quotedMsgSerializedId block with:

```typescript
  let resolvedQuotedId: string | undefined;
  if (options?.quotedMessageId) {
    const constructed = getSerializedMessageId(
      to,
      Boolean(options.quotedMessageFromMe),
      options.quotedMessageId
    );
    let cached = await wbot.getMessageById(constructed);
    if (!cached) {
      const chat = await wbot.getChatById(to);
      const msgs = await chat.fetchMessages({ limit: 50 });
      cached = msgs.find(m => m.id.id === options.quotedMessageId) ?? null;
    }
    if (cached) {
      resolvedQuotedId = cached.id._serialized;
      logger.info(`[reply] resolved quotedId for text: ${resolvedQuotedId}`);
    } else {
      logger.warn(`[reply] quoted message not found for text: ${options.quotedMessageId}`);
    }
  }

  const sentMessage = await wbot.sendMessage(to, body, {
    quotedMessageId: resolvedQuotedId,
    linkPreview: options?.linkPreview
  });
```

Remove the old `quotedMsgSerializedId` variable and the old `if (quotedMsgSerializedId)` block entirely.

---

### Change B — `sendMedia` function (lines 369-399)

Same pattern, replace the existing quotedMediaSerializedId block with:

```typescript
  let resolvedQuotedMediaId: string | undefined;
  if (options?.quotedMessageId) {
    const constructed = getSerializedMessageId(
      to,
      Boolean(options.quotedMessageFromMe),
      options.quotedMessageId
    );
    let cached = await wbot.getMessageById(constructed);
    if (!cached) {
      const chat = await wbot.getChatById(to);
      const msgs = await chat.fetchMessages({ limit: 50 });
      cached = msgs.find(m => m.id.id === options.quotedMessageId) ?? null;
    }
    if (cached) {
      resolvedQuotedMediaId = cached.id._serialized;
      logger.info(`[reply] resolved quotedId for media: ${resolvedQuotedMediaId}`);
    } else {
      logger.warn(`[reply] quoted message not found for media: ${options.quotedMessageId}`);
    }
  }

  const mediaOptions: MessageSendOptions = {
    caption: options?.caption,
    sendAudioAsVoice: options?.sendAudioAsVoice,
    quotedMessageId: resolvedQuotedMediaId
  };
```

Remove the old `quotedMediaSerializedId` variable and the old `if (quotedMediaSerializedId)` block.

---

## After changes

```bash
cd /Users/sviat/whaticket/backend && npm run build 2>&1 | tail -10
```

Must pass with 0 errors.

Then deploy: `docker compose up -d --build backend`

Test:
1. Send text reply → quote bubble visible in CRM and on phone
2. Send media reply → same
3. Check `docker logs backend --tail 50` → should see `[reply] resolved quotedId` log lines
