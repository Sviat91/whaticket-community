# Plan: Fall back to the LID/PN sibling JID when looking up a contact's tcToken

## Root cause (confirmed via production DB query + upstream source read)

Outgoing messages to contact JID `268963787329585@s.whatsapp.net` (ticket #27 "Cargo 2") keep
failing with `"received 400 error in ack"`, even after upgrading `whaileys` to 6.5.0 (which fixed a
related-but-different LID bug — see `handoff/whaileysUpgrade_plan.md`).

Confirmed in production DB: `WppKeys` has a `contacts-tc-token` row for
`268963787329585@lid`, but **none** for `268963787329585@s.whatsapp.net` (checked via
`SELECT keyId FROM WppKeys WHERE type='contacts-tc-token' AND keyId LIKE '268963787329585%'` —
only the `@lid` row came back).

Confirmed in `node_modules/whaileys/lib/Socket/messages-send.js` (still true in 6.5.0, line ~541):
```js
const contactTcTokenData = !isGroup && !isRetryResend && !isStatus
  ? await authState.keys.get("contacts-tc-token", [destinationJid])
  : {};
```
`destinationJid` is only rewritten from the plain phone-number JID to the LID form earlier in the
same function (line ~404-408) when a live device-sync (`getUSyncDevices`) call reports
`isLidMode` for *all* resolved devices. When that doesn't happen for a given send (sync cache miss,
timing, etc.), `destinationJid` stays as the phone-number JID, `authState.keys.get` is called with
that form, and it misses the token we only ever stored under the LID form — so no tcToken is
attached and WhatsApp rejects the message.

This goes through our own `GetWppSessionKeys` service (`backend/src/services/WppKeyServices/
GetWppSessionKeys.ts`), which today does a single exact-match `WppKey.findOne({ keyId: id })` per
requested id, with no fallback.

## Scope / non-goals

- Only touches the MySQL lookup path in `GetWppSessionKeys.ts`, and only for
  `type === "contacts-tc-token"`. Does not touch the Redis branch, `StoreWppSessionKeys.ts`, or any
  other key type (`session`, `sender-keys`, `app-state-sync-key`, etc.).
- Does not attempt to fix the underlying LID/PN resolution inside the `whaileys` library itself —
  that's vendored code; this is a compensating read-side fallback in our own service.
- Does not assume LID and phone-number JIDs always share the same digits in general — only adds a
  *best-effort* fallback lookup; if the sibling row doesn't exist either, behavior is unchanged
  (returns nothing for that id, same as today).
- No schema change, no new dependency, no migration.

## Steps

- [x] 1. `backend/src/services/WppKeyServices/GetWppSessionKeys.ts`
  - Add a small local helper that derives the "sibling" JID for a given id by swapping the address
    suffix, keeping the same user-part digits:
    ```ts
    const swapJidSuffix = (id: string): string | null => {
      if (id.endsWith("@s.whatsapp.net")) {
        return `${id.slice(0, -"@s.whatsapp.net".length)}@lid`;
      }
      if (id.endsWith("@lid")) {
        return `${id.slice(0, -"@lid".length)}@s.whatsapp.net`;
      }
      return null;
    };
    ```
  - In the `ids.map(async id => { ... })` block inside the MySQL branch: change `const keyRecord =`
    to `let keyRecord =`, keep the existing `WppKey.findOne({ where: { connectionId, type, keyId: id } })`
    call as the first attempt. If it returns null/undefined **and** `type === "contacts-tc-token"`,
    compute `const altId = swapJidSuffix(id)`, and if `altId` is non-null, try
    `keyRecord = await WppKey.findOne({ where: { connectionId, type, keyId: altId } })`.
  - Keep storing the result under the **original** requested `id` (`data[id] = JSON.parse(...)`),
    not the alternate id — the caller (whaileys) looks it up by the id it originally requested.
  - Keep everything else in the file unchanged: the Redis branch, the `try/catch` around the whole
    `Promise.all`, the function signature, imports, exports.

## Testing

- Per established project preference (see [[feedback_no_unprompted_docker_local]]), do not run
  `npm test` locally (requires MySQL, previously triggered an unwanted Docker Desktop launch).
- Verify by reading the diff: confirm the fallback only triggers for `contacts-tc-token`, confirm it
  only fires on a miss (not overriding a real hit), confirm no behavior change for every other key
  type, confirm `npm run build` (tsc) passes.

## Verification after deploy

- Deploy via the same manual step used for the whaileys upgrade: run this fix on the server, rebuild
  (`docker compose up -d --build backend`).
- Retry a send to `268963787329585@s.whatsapp.net` (ticket #27 "Cargo 2") — it should now find the
  `@lid`-stored token and go through (at least reach double grey checkmark).
- Confirm no regression: a normal send to a healthy contact (one that already has a matching-form
  token, or none at all) still works exactly as before.
- If this contact *still* fails after this fix, that rules out the LID/PN key-mismatch theory
  entirely for this contact and the investigation needs to look elsewhere (e.g. capture the raw
  stanza/attrs at send time for this specific JID).
