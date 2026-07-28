# Plan: Stop fabricating phone numbers from LIDs and address LID-only contacts correctly

**Date:** 2026-07-28
**Status:** In Progress

## Goal

Stop storing LID digits in `Contacts.number` when no real phone number is resolvable, address such
contacts by their `@lid` JID on the outbound send path, and repair the contacts already corrupted in
production — so that messages to LID-only contacts ("Cargo 2", "Vasil") actually get delivered.

## Root cause (already confirmed — do not re-investigate)

WhatsApp is migrating contacts to LID (anonymized) addressing. For some contacts, incoming messages
arrive addressed only by `<digits>@lid`, with no phone-number counterpart anywhere in the envelope
(`senderPn` / `participantPn` / `peerRecipientPn`, collected at
`backend/src/providers/WhatsApp/Implementations/whaileys.ts:577-596`).

In `convertToContactPayload` (`whaileys.ts:532`), `number` is derived at lines 677-680:

```ts
const number =
  (isJidUser(resolvedJid) && decoded?.user) ||
  jidDecode(preferPn || "")?.user ||
  normalizedJid.split("@")[0];
```

When `resolvedJid` is LID-based and no `preferPn` exists, this falls through to
`normalizedJid.split("@")[0]`, which extracts the **LID's digits** and stores them as if they were a
phone number, via `CreateOrUpdateContactService`. Confirmed in production: contact "Cargo 2" (id 23)
has `number = '268963787329585'` **and** `lid = '268963787329585@lid'` — identical digits, i.e. the
number is fabricated.

Every outbound path then builds the destination from `contact.number` only
(`SendWhatsAppMessage.ts:23`, `SendWhatsAppMedia.ts:27`), producing `<lid-digits>@c.us`, which
`whaileys.ts`'s `normalizeJid` (lines 140-144) rewrites to `<lid-digits>@s.whatsapp.net` — an
address that belongs to no real account. WhatsApp rejects it (`"received 400 error in ack"`, single
grey checkmark forever).

This is why the two previously shipped fixes did not help: the `whaileys` 6.4.14→6.5.0 upgrade and
the tcToken LID fallback in `GetWppSessionKeys.ts` were both real fixes for *adjacent* bugs, but the
message here never reaches a valid recipient address in the first place.

## Architecture decisions

1. **`normalizeJid` in `whaileys.ts` is left untouched.** It already passes `@lid` JIDs through
   unchanged (`"x@lid".replace(/@c\.us$/i, ...)` is a no-op), so if we hand it a `@lid` JID it does
   the right thing. Only the *callers* that hardcode the `@c.us` suffix need to change. This is the
   smallest possible change and keeps behaviour identical for the 99% of contacts that do have a
   real number.
2. **One shared helper builds the destination JID** (`src/helpers/BuildChatId.ts`) instead of
   duplicating a ternary at 5 call sites. Rule: if `contact.number` is empty and `contact.lid` is
   present → use the `@lid` JID; otherwise keep today's `<number>@c.us` / `<number>@g.us`.
3. **Empty number is persisted as SQL `NULL`, never as `""`.** `Contacts.number` carries a UNIQUE
   index; two LID-only contacts both storing `""` would collide on that index. MySQL/MariaDB allow
   *multiple* NULLs under a UNIQUE index (true for InnoDB in both engines; this deployment is
   `mariadb:10.6` per `docker-compose.yaml:62`), so NULL is the correct representation of "unknown".
4. **The schema is already correct — verify, don't re-migrate.** `Contacts.number` was already made
   nullable by the existing migration
   `backend/src/database/migrations/20241203000001-allow-null-number-in-contacts.ts`, and
   `src/models/Contact.ts:27-29` declares `number` with `@Unique` but *without* `@AllowNull(false)`.
   Since sequelize applies migrations in filename order and the later `20260720000000-add-nameLocked-to-contacts`
   is live in production, `20241203000001` must already have run. Step 1 is therefore a *verification*
   step; a second nullability migration would only add a redundant duplicate UNIQUE index in MariaDB.
5. **Data repair ships as a migration, not a manual SQL script.** The repo has no precedent for
   data-only migrations (all 40 existing migrations are DDL), but migrations are the project's only
   automated deploy hook (`backend/Dockerfile:38-39` runs `npx sequelize db:migrate` on every
   container start), the repair is a single idempotent `UPDATE`, and shipping it as a migration means
   no manual SSH step can be forgotten or run twice with a different result. This beats a documented
   manual script on both safety and auditability.
6. **wwebjs gets no code change.** `wwebjs.ts` never populates `Contact.lid` anywhere (verified: no
   LID handling exists in that file), so a LID-only contact cannot be created while running the
   wwebjs provider. Documented as a known limitation rather than speculative code.

## Scope / non-goals

- **Do not touch the `nameLocked` logic** in `CreateOrUpdateContactService.ts` or
  `UpdateContactService.ts` — it is confirmed working and out of scope. Name handling changes only
  as an incidental consequence (see Risks).
- Does not merge, delete or de-duplicate contacts; the repair only nulls a bogus column value.
- Does not touch tickets, messages, `WppKeys`, `GetWppSessionKeys.ts`, or the `whaileys` library.
- Does not change the frontend.
- Does not attempt LID↔phone-number resolution via live WhatsApp queries (e.g. `onWhatsApp`) — out
  of scope; if we have no phone number, we address by LID.
- Does not touch the group-contact branch of `convertToContactPayload` (`whaileys.ts:632-664`) —
  it returns early and is unaffected.

## Implementation steps

- [?] **Step 0 — Pre-flight verification against the production DB (read-only)**
  - **NOT executed by the coding agent** — no access to the production server (remote VPS,
    SSH-only). Local-file verification was done instead: confirmed
    `20241203000001-allow-null-number-in-contacts.ts` sets `allowNull: true` on `Contacts.number`,
    and `src/models/Contact.ts` has no `@AllowNull(false)` on `number`, consistent with the plan's
    assumption. **The user must run the three SQL queries above on the production server before
    (and the post-deploy checks after) applying this change** — no query results are fabricated
    here.
  - Run and record the output of:
    ```sql
    SHOW COLUMNS FROM Contacts LIKE 'number';
    SELECT id, name, number, lid, nameLocked FROM Contacts
      WHERE id = 23 OR number IN ('268963787329585','270462814818323')
         OR lid IN ('268963787329585@lid','270462814818323@lid');
    SELECT id, number, lid FROM Contacts
      WHERE lid IS NOT NULL AND lid = CONCAT(number, '@lid');
    ```
  - Purpose: (a) confirm `number` is already `YES` for Null; (b) confirm the exact row shape of
    "Vasil" (its `Contacts` row was never pulled up — do **not** assume it mirrors "Cargo 2");
    (c) get the full list of affected rows the repair will touch.
  - If `SHOW COLUMNS` reports `Null: NO`, then and only then add a new migration
    `20260728000000-allow-null-number-in-contacts.ts` mirroring `20241203000001` (use
    `changeColumn` with `allowNull: true, unique: true`) and note why in this plan.

- [x] **Step 1 — Confirm nullability semantics; no new schema migration expected**
  - Files: `backend/src/database/migrations/20241203000001-allow-null-number-in-contacts.ts` (read
    only), `backend/src/models/Contact.ts` (read only).
  - Confirm the model has no `@AllowNull(false)` on `number` and keeps `@Unique`.
  - Confirm MariaDB permits multiple NULL rows under the UNIQUE index on `Contacts.number` — a
    one-liner check is enough:
    ```sql
    SELECT COUNT(*) FROM Contacts WHERE number IS NULL;   -- must be able to exceed 1
    ```
    (`src/__tests__/unit/Contact/CreateOrUpdateContactService.spec.ts:97-103` already creates a
    contact with `lid` and no `number`, so this path is exercised today.)
  - Outcome of this step is a written confirmation in the PR/commit message, not a code change.

- [x] **Step 2 — Stop fabricating `number` from LID digits**
  - File: `backend/src/providers/WhatsApp/Implementations/whaileys.ts` (lines 677-680, inside
    `convertToContactPayload`).
  - Read lines 660-700 first. Change only the final fallback so that a LID-form JID never donates
    its digits:
    ```ts
    const number =
      (isJidUser(resolvedJid) && decoded?.user) ||
      jidDecode(preferPn || "")?.user ||
      (isLidUser(resolvedJid) ? "" : normalizedJid.split("@")[0]);
    ```
    `isLidUser` is already imported and used at line 683 — verify before relying on it.
  - Ensure the returned `number` is typed `string` (`ContactPayload.number` is `string` at
    `src/handlers/handleWhatsappEvents.ts:30-36`); coerce with `|| ""` if TS complains. Do **not**
    widen `ContactPayload.number` to optional — empty string at the boundary, NULL in the DB.
  - Leave `lidValue` (line 682-683) and the `name` fallback chain (685-691) as they are.

- [x] **Step 3 — Persist empty numbers as NULL, never as `""`**
  - File: `backend/src/services/ContactServices/CreateOrUpdateContactService.ts`.
    - Line 36: make the normalization defensive against `undefined`:
      `const number = isGroup ? rawNumber : (rawNumber || "").replace(/[^0-9]/g, "");`
    - Keep the `if (!number && !lid) throw new Error(...)` guard at line 37 exactly as is — it
      already permits lid-only contacts.
    - Line 107-115 (`Contact.create`): pass `number: number || undefined` so Sequelize omits the
      column from the INSERT and MariaDB stores NULL. Verify by reading that Sequelize v5
      (`package.json:47`) drops `undefined` attributes from the INSERT; if TS or Sequelize resists,
      use `number: number || null` with the minimal cast required — the observable requirement is
      that the stored value is `NULL`, not `''`.
    - Do not change lines 44-105 (merge branch, `contactByNumber` branch, `contactByLid` branch) —
      in particular do **not** touch any `nameLocked` expression.
  - File: `backend/src/services/ContactServices/UpdateContactService.ts` (line 63).
    - `const updatePayload: Partial<Contact> = { name, number, email };` — an operator editing a
      LID-only contact in the UI submits `number: ""`
      (`frontend/src/components/ContactModal/index.js:60` does not require it), which would write
      `''` and then collide with the UNIQUE index on the *second* such contact. Normalize:
      `number: number || undefined` (or equivalent) so an empty submission leaves the column
      untouched/NULL. Leave the `nameLocked` block at lines 64-66 alone.
  - File: `backend/src/services/ContactServices/CreateContactService.ts` — read it, expect **no
    change**: it is only reached from `ContactController` (Yup-validated, number required) and the
    vCard path, both of which always supply a number. State explicitly in the handoff that it was
    reviewed and left untouched.

- [x] **Step 4 — Address LID-only contacts correctly on the outbound path**
  - New file: `backend/src/helpers/BuildChatId.ts` (naming matches `SerializeWbotMsgId.ts` /
    `SetTicketMessagesAsRead.ts`):
    ```ts
    import Contact from "../models/Contact";

    const BuildChatId = (contact: Contact, isGroup: boolean): string => {
      if (!contact.number && contact.lid) {
        return contact.lid.includes("@") ? contact.lid : `${contact.lid}@lid`;
      }
      return `${contact.number}@${isGroup ? "g" : "c"}.us`;
    };

    export default BuildChatId;
    ```
    (The `includes("@")` guard exists because at least one fixture stores a bare `lid-12345`
    value — see the spec file; production rows do carry the `@lid` suffix.)
  - **Critical prerequisite** — `backend/src/services/TicketServices/ShowTicketService.ts:14`
    restricts the contact include to `attributes: ["id", "name", "number", "profilePicUrl"]`, so
    `ticket.contact.lid` is currently `undefined` on every send initiated from
    `MessageController.store` (line 48). Add `"lid"` to that attributes array, otherwise this entire
    fix silently does nothing. Do not change any other include in that file.
  - Replace the hardcoded chat-id construction with `BuildChatId(ticket.contact, ticket.isGroup)` in:
    - `backend/src/services/WbotServices/SendWhatsAppMessage.ts:23`
    - `backend/src/services/WbotServices/SendWhatsAppMedia.ts:27`
    - `backend/src/services/WbotServices/DeleteWhatsAppMessage.ts:23` (its include is unrestricted
      `include: ["contact"]`, so `lid` is available)
    - `backend/src/helpers/SetTicketMessagesAsRead.ts:24`
  - `backend/src/handlers/handleWhatsappEvents.ts:183` and `:204` (`handleQueueLogic`) build
    `` `${contactPayload.number}@c.us` `` from a `ContactPayload`, not a `Contact` model, so
    `BuildChatId` does not apply directly. Use the same rule inline, computed once at the top of
    `handleQueueLogic`:
    ```ts
    const chatId = contactPayload.number
      ? `${contactPayload.number}@c.us`
      : contactPayload.lid || "";
    ```
    and reuse it in both `sendMessage` calls. If `chatId` is empty, skip the send (both calls are
    already inside `try/catch` + `logger.error`).
  - **wwebjs**: no change to `backend/src/providers/WhatsApp/Implementations/wwebjs.ts`. It passes
    `to` straight into `wbot.sendMessage` → `WWebJS.getChat` → `WAWebWidFactory.createWid`, which
    *may* accept an `@lid` wid (the library does handle LID wids elsewhere, e.g.
    `Client.js:3308 getContactLidAndPhone`, `structures/Contact.js:161`), but this is unverified and
    unreachable in practice because wwebjs never writes `Contact.lid`. **Known limitation to state in
    the handoff:** under `WHATSAPP_PROVIDER=wwebjs`, a LID-only contact created while running
    whaileys cannot be reliably messaged.
  - Do **not** touch `backend/src/helpers/SerializeWbotMsgId.ts` — it also concatenates
    `contact.number`, but it is dead code (no importers anywhere in `src/`). Mention it, leave it.
  - Do **not** touch `handleWhatsappEvents.ts:371` (`checkExternallyReadTickets`) — wwebjs-only,
    already per-ticket `try/catch`, and unreachable for LID-only contacts.

- [x] **Step 5 — One-off data repair migration**
  - New file: `backend/src/database/migrations/20260728000001-null-fabricated-lid-numbers.ts`
    (bump the numeric suffix if Step 0 required a nullability migration at `...000000`).
  - `up`: a single idempotent raw statement via `queryInterface.sequelize.query(...)`:
    ```sql
    UPDATE Contacts
       SET number = NULL
     WHERE lid IS NOT NULL
       AND number IS NOT NULL
       AND lid = CONCAT(number, '@lid');
    ```
    Re-running is a no-op (after the first run no row matches). It touches only `number`; `name`,
    `nameLocked`, `lid`, tickets and messages are untouched. Follow the existing migration file
    style: `import { QueryInterface } from "sequelize";` + `module.exports = { up, down }`.
  - `down`: no-op (`return Promise.resolve();`) with a one-line comment explaining that the removed
    values were fabricated and are intentionally not restorable.
  - Do not add any other statement to this migration.

- [x] **Step 6 — Null-safety audit + build**
  - Grep project-wide before declaring done: `contact.number`, `.contact.number`, `contactPayload.number`,
    `where: { number`. Known hits and expected verdicts (confirm each, fix only if genuinely broken):
    | Location | Verdict |
    |---|---|
    | `services/WbotServices/SendWhatsAppMessage.ts:23` | fixed in Step 4 |
    | `services/WbotServices/SendWhatsAppMedia.ts:27` | fixed in Step 4 |
    | `services/WbotServices/DeleteWhatsAppMessage.ts:23` | fixed in Step 4 |
    | `helpers/SetTicketMessagesAsRead.ts:24` | fixed in Step 4 |
    | `handlers/handleWhatsappEvents.ts:183,204` | fixed in Step 4 |
    | `handlers/handleWhatsappEvents.ts:371` | left as is (wwebjs-only, guarded) |
    | `helpers/SerializeWbotMsgId.ts:5` | dead code, left as is |
    | `services/TicketServices/ListTicketsService.ts:103` (`$contact.number$ LIKE`) | NULL-safe in SQL (never matches), no change |
    | `services/ContactServices/ListContactsService.ts:28` | same, no change |
    | `services/ContactServices/GetContactService.ts:23`, `ImportContactsService.ts:28`, `CreateContactService.ts:26` | always called with a real number, no change |
  - Run `npm run build` from `backend/` — must pass with no new TS errors.
  - Run `npm run format` if the diff touches formatting-sensitive lines.

- [x] **Step 7 — Tests (write, do not execute locally)**
  - File: `backend/src/__tests__/unit/Contact/CreateOrUpdateContactService.spec.ts`.
  - Add one case: creating a contact with `number: ""` + `lid: "999999999999999@lid"` yields a
    contact whose `number` is null/falsy and whose `lid` is stored; and a second call with a
    *different* lid and empty number also succeeds (this is the UNIQUE-index regression guard).
  - Match the existing style in that file (`truncate()` in `beforeEach`/`afterEach`, socket mock at
    the top). **Do not run `npm test` locally** — it requires MySQL and previously triggered an
    unwanted Docker Desktop launch on this machine. The suite runs in the normal CI/server flow.

## Testing

- Primary gate is `npm run build` (tsc) from `backend/` plus careful diff reading, per the standing
  project convention (see `handoff/tcTokenLidFallback_plan.md`, "Testing").
- Read-through checklist for the reviewer:
  - No behaviour change for any contact that has a real `number` (the new branch only fires when
    `number` is falsy).
  - No `nameLocked` expression modified anywhere.
  - `Contact.create` stores `NULL`, not `''`, when the number is empty.
  - `"lid"` is present in `ShowTicketService`'s contact `attributes`.
  - The repair migration's `WHERE` clause cannot match a contact with a genuine number that differs
    from its LID digits.

## Verification after deploy

Deploy normally: commit the TypeScript sources + the migration (`backend/.gitignore` excludes only
`node_modules`, `public/*`, `dist`, `.env*`, `package-lock.json`, `/src/config/sentry.js`, coverage
and `.wwebjs_auth/` — `src/` and `src/database/migrations/` are tracked), then on the server:

```bash
docker compose up -d --build backend
```

Migrations run automatically from the container `CMD` (`npx sequelize db:migrate && node dist/server.js`,
`backend/Dockerfile:38-39`) — no manual migration step.

Then verify, in order:

1. `SELECT id, number, lid FROM Contacts WHERE lid IS NOT NULL AND lid = CONCAT(number, '@lid');`
   → must return **0 rows**.
2. `SELECT id, name, number, lid, nameLocked FROM Contacts WHERE id = 23;`
   → `number` is `NULL`, `lid` still `268963787329585@lid`, `name` still `Cargo 2`, `nameLocked`
   unchanged from the Step 0 snapshot.
3. Same check for the "Vasil" row identified in Step 0.
4. Send a text message to the "Cargo 2" ticket (#27). In the backend logs, the
   `[RAW] Message sent` debug entry (`whaileys.ts:1275-1283`) must show
   `to: "268963787329585@lid"` — **not** `@s.whatsapp.net`. The message should progress past a
   single grey checkmark; no `received 400 error in ack`.
5. Send a media message to the same ticket — same expectation via the `[RAW] Media sent` log.
6. Regression: send a text to a normal contact with a real number — log must still show
   `<number>@s.whatsapp.net` and deliver as before.
7. Wait for an inbound message from a LID-only contact and confirm no *new* duplicate contact row
   was created (the existing row is matched by `lid`).
8. Open the contact in the UI: it renders with an empty phone number and does not crash the
   Contacts list or the ContactDrawer.

## Rollback

- `git revert` the commit + `docker compose up -d --build backend`. The code returns to its previous
  behaviour immediately.
- The data-repair migration's `down` is intentionally a no-op: the nulled values were fabricated LID
  digits and must not be restored. If the code is reverted while the numbers stay NULL, affected
  contacts revert to "cannot send" (their pre-fix state) — no worse than today — and a subsequent
  inbound message will repopulate `number` with the fabricated digits again under the old code.
- No schema change to roll back (Step 1 is verification only), unless Step 0 forced a nullability
  migration, whose `down` restores `allowNull: false` — that `down` will fail while NULL rows exist,
  which is expected and acceptable.

## Acceptance criteria

- [ ] `npm run build` passes from `backend/` with no new TypeScript errors.
- [ ] A LID-only contact is stored with `number IS NULL` (not `''`) and a populated `lid`.
- [ ] Two distinct LID-only contacts can coexist without violating the UNIQUE index on `number`.
- [ ] Outbound text and media to a LID-only contact are addressed as `<digits>@lid`, verified in the
      `[RAW] Message sent` / `[RAW] Media sent` logs.
- [ ] Contacts with a real number are addressed exactly as before (`<number>@s.whatsapp.net`).
- [ ] `ShowTicketService` loads `lid` for the ticket's contact.
- [ ] The repair query returns 0 rows after deploy; "Cargo 2" (id 23) and "Vasil" keep their name,
      `nameLocked` and `lid`.
- [ ] No `nameLocked` logic was modified anywhere in the diff.
- [ ] The coder has grepped `contact.number` / `.number` project-wide and confirmed every remaining
      usage is either fixed, provably NULL-safe, or explicitly documented as an accepted limitation
      (Step 6 table).

## Constraints & risks

- **This turns a de-facto NOT-NULL lookup key into a nullable one.** `Contacts.number` is used as a
  match key in `CreateOrUpdateContactService`, `GetContactService`, `CreateContactService`,
  `ImportContactsService`, and as a search target in `ListContactsService` / `ListTicketsService`.
  The Step 6 audit table is mandatory, not optional — the coder must confirm each remaining usage
  before considering the task done.
- **Do not touch `nameLocked`.** It is a separately shipped, working feature; any diff line touching
  it is a review rejection.
- **`ShowTicketService` attribute list is the silent-failure trap.** If `"lid"` is not added there,
  everything else in this plan compiles, deploys, and changes nothing observable.
- **Empty string vs NULL** is the second trap: `''` is *not* NULL and *will* collide on the UNIQUE
  index the moment a second LID-only contact appears. Both the create path and the update path must
  normalize.
- **Display-name side effect (accepted, no action):** for a *brand-new* LID-only contact with no
  pushName, the `name` fallback chain at `whaileys.ts:685-691` previously resolved to the fabricated
  digits and will now resolve to `<digits>@lid`. Existing contacts keep their stored names
  (`name || contact.name` / `nameLocked`). Cosmetic only — do not "fix" it in this change.
- **Repair query false positive (accepted, negligible):** the repair matches only when the LID digits
  are byte-identical to the stored number. A contact whose real phone number happens to equal its LID
  digits would be nulled out; LIDs are ~15-digit synthetic ids, so this does not occur in practice,
  and such a contact would still be reachable via the new `@lid` path. Step 0's `SELECT` prints the
  exact affected rows for a human sanity check *before* the migration runs.
- **wwebjs limitation (documented, not fixed):** under `WHATSAPP_PROVIDER=wwebjs`, contacts with only
  a `lid` cannot be reliably addressed; `whatsapp-web.js` LID chat addressing was not verified and
  wwebjs never produces such contacts itself.
- **Frontend is out of scope** but is affected: `frontend/src/pages/Contacts/index.js:309`,
  `components/ContactDrawer/index.js:126` and `components/NewTicketModal/index.js:87,116-125` read
  `contact.number`. React renders `null` as empty, so this degrades gracefully — flag if the manual
  UI check in "Verification after deploy" step 8 shows otherwise.
- **Do not touch:** `GetWppSessionKeys.ts` / `StoreWppSessionKeys.ts` (previous fix), the `whaileys`
  or `whatsapp-web.js` dependency versions, `normalizeJid`, the group branch of
  `convertToContactPayload`, `SerializeWbotMsgId.ts` (dead code), or `checkExternallyReadTickets`.
- **Do not run `npm test` locally** — requires MySQL and previously triggered an unwanted Docker
  Desktop launch.
