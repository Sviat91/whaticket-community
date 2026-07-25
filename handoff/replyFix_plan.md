# Plan: Fix broken WhatsApp replies (whaileys/Baileys provider)

## Root cause (confirmed via library source read)

`whaileys.ts`'s `sendMessage`/`sendMedia` build a manual `contextInfo: { stanzaId, participant }`
object and place it as a **sibling field inside the message content** (e.g. `{ text: body, contextInfo }`).

Checked `backend/node_modules/whaileys/lib/Utils/messages.js`:
- `generateWAMessageContent` (lines 195-381) only copies recognized keys (`text`, `contacts`,
  `location`, media types, etc.) into the outgoing proto message. It never reads or forwards a
  top-level `contextInfo` field — it is silently dropped.
- The library's real quoting mechanism is a `quoted: WAMessage` field passed via the **options**
  argument (3rd arg) of `sock.sendMessage(jid, content, options)`, consumed at lines 389-413,
  which correctly derives `contextInfo.stanzaId`, `contextInfo.participant`, and
  `contextInfo.quotedMessage`.
- Confirmed `sock.sendMessage` auto-injects `options.userJid = authState.creds.me.id`
  (`backend/node_modules/whaileys/lib/Socket/messages-send.js:667-683`), so we do not need to
  supply our own JID for the `fromMe` participant case.

This means every reply currently sends as a plain message with no quote attached, on messages of
any age (reproduced live: replying to a message ~51 min old, same whaileys session throughout).

**Also confirmed:** the existing `msgCacheLRU` (whaileys.ts:128-133) has a 10-minute TTL. A fix
that depends on that cache to reconstruct the quoted message content would still fail for replies
to anything older than 10 minutes (as in the repro). The fix must build quoted content from data
already in our own `Message` DB row (`body`), not from that cache.

## Scope / non-goals

- Only touches the reply/quote code path in `sendMessage` and `sendMedia` in `whaileys.ts`, plus
  the two small service files that call into it. No DB schema change, no new dependency.
- Does not touch auth, socket lifecycle, reconnect, or session persistence code — no WhatsApp
  session risk.
- Do not "improve" group-chat participant resolution beyond current behavior — out of scope, not
  reported broken, avoid scope creep.
- Do not attempt to enrich the quoted preview using `msgCacheLRU` — deliberately out of scope,
  the DB-backed `{ conversation: body }` fallback is sufficient and always available regardless of
  cache TTL (Simplicity First: minimum fix that solves the reported bug).

## Steps

- [x] 1. `backend/src/providers/WhatsApp/types/ProviderOptions.ts`
  - Add `quotedMessageBody?: string;` to both `SendMessageOptions` and `SendMediaOptions`.

- [x] 2. `backend/src/services/WbotServices/SendWhatsAppMessage.ts`
  - In the options object passed to `whatsappProvider.sendMessage`, add:
    `quotedMessageBody: quotedMsg?.body`

- [x] 3. `backend/src/services/WbotServices/SendWhatsAppMedia.ts`
  - In `mediaOptions`, add: `quotedMessageBody: quotedMsg?.body`

- [x] 4. `backend/src/providers/WhatsApp/Implementations/whaileys.ts` — `sendMessage`
  - Remove the manual `contextInfo` construction (current lines ~1252-1260).
  - Build a `quoted` object when `options?.quotedMessageId` is present:
    ```ts
    const quoted = options?.quotedMessageId
      ? {
          key: {
            remoteJid: toJid,
            fromMe: Boolean(options.quotedMessageFromMe),
            id: options.quotedMessageId
          },
          message: { conversation: options.quotedMessageBody || "" }
        }
      : undefined;
    ```
  - Call `wbot.sendMessage(toJid, { text: body }, quoted ? { quoted } : undefined);`
  - Keep everything else in the function (return shape, logging, `msgCache.save`) unchanged.

- [x] 5. `backend/src/providers/WhatsApp/Implementations/whaileys.ts` — `sendMedia`
  - Remove the `contextInfo` variable and its use inside every branch of `buildPayload()`
    (image/video/audio/document) — those message bodies no longer carry `contextInfo` at all.
  - Build the same `quoted` object as step 4 (same shape, same fallback).
  - Change the send call to `wbot.sendMessage(toJid, message, quoted ? { quoted } : undefined);`
  - Keep everything else (return shape, logging, `msgCache.save`) unchanged.

## Testing

- Add/extend Jest unit spec(s) mocking `wbot.sendMessage` to assert that when a `quotedMessageId`
  is passed, the call now includes a third `{ quoted: { key: {...}, message: {...} } }` argument
  with the expected shape — and that no `contextInfo` field is ever placed inside the content
  argument. Cover both `sendMessage` and `sendMedia`.
- Per established project preference (see prior session), do **not** attempt to run `npm test`
  locally (requires MySQL, previously triggered an unwanted Docker Desktop launch) — write and
  hand-trace the spec, defer execution/verification to a live reply test on the production server
  after deploy.

## Verification after deploy

- User sends a reply to an existing contact message on the live AVS/whaileys connection.
- Confirm the quoted message preview now appears above the reply bubble in WhatsApp (on the
  recipient's device, not just the agent's UI).
- Confirm no regression on: plain (non-reply) text send, plain media send, media send with a
  caption.
