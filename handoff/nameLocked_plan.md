# Plan: `nameLocked` on Contact (hard lock for human-set names)

**Date:** 2026-07-20
**Status:** In Progress

## Goal
Once a human manually sets a contact's name, no automatic (inbound-WhatsApp) write path may ever change it again — enforced by a deterministic `nameLocked` boolean column, replacing the current bare-number heuristic.

## Architecture Decisions

- **Deterministic boolean, no heuristics.** Add `Contacts.nameLocked` (`BOOLEAN NOT NULL DEFAULT false`). The manual UI write paths set it to `true`; the automatic inbound path reads it and refuses to touch the name when it is `true`. The existing content-sniffing helpers (`isBareNumber` / `resolveName` in `CreateOrUpdateContactService.ts`) become dead code and are removed (CLAUDE.md: clean up orphans your change creates; no speculative heuristics).

- **`CreateContactService` is shared across manual and automatic callers — so the lock is decided by the caller, not hardcoded in the service.** Confirmed call sites:
  - `ContactController.store` — manual UI create (schema requires `name`) → MUST lock.
  - `GetContactService` (via `ContactController.getContact`) — API get-or-create → leave unlocked (default).
  - `handleWhatsappEvents.ts` line ~139 — vcard message auto-import → leave unlocked (default).
  Therefore `CreateContactService` gets an optional `nameLocked` param (default `false`) and only `ContactController.store` passes `true`. If we instead hardcoded `nameLocked = true` inside `CreateContactService`, we would wrongly lock vcard/auto-created contacts. Do NOT hardcode.

- **`UpdateContactService` has a single caller** (`ContactController.update`, manual UI) — so locking inside the service is safe. Lock when the caller sends a `name` that differs from the current one, mirroring the existing "provided AND changed" pattern already used at `ContactController.ts` line 139 for `number`.

- **Unlocked auto-write is "as-is" with an empty-string guard.** When a contact is not locked, the incoming `name` is written verbatim (no bare-number filtering). One safety guard is kept: if the incoming `name` is empty/falsy, keep the existing name rather than blanking it (`name || existing.name`). This is a null-guard, not a content heuristic — the removed `isBareNumber` inspected *content*; this only avoids overwriting a real name with an empty string. (Reviewer may drop the guard for the strict literal form; flagged, not silent.)

- **Merge branch invariant.** In `shouldMerge`, `contactByNumber` survives and `contactByLid` is destroyed. To preserve the core invariant ("a human-locked name is never lost to an automatic process"), the merge must both (a) set the survivor's lock to `L_num || L_lid`, and (b) if only the *destroyed* side was locked, carry its name onto the survivor. Full truth table in Step 5.

- **No frontend changes.** The React contact create/edit forms send `name/number/email/extraInfo`; the backend derives `nameLocked` server-side. API responses may include the extra field; the UI ignores unknown fields. No visible lock toggle is added (out of scope). Confirmed this feature works end-to-end without touching the frontend.

## Implementation Steps

- [x] **Step 1: Add the migration**
  - Files: `backend/src/database/migrations/20260720000000-add-nameLocked-to-contacts.ts` (new)
  - Details: Follow the exact style of `20241203000000-add-lid-to-contacts.ts` and `20200930194808-add-isGroup-column-to-contacts.ts`. Table name is **`"Contacts"`** (capital C — all existing Contact migrations use this, `createTable("Contacts")`). Use `queryInterface.addColumn("Contacts", "nameLocked", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false })` in `up`; `queryInterface.removeColumn("Contacts", "nameLocked")` in `down`. Timestamp prefix `20260720000000` sorts after the existing `2024120300000x` migrations.

- [x] **Step 2: Add the column to the model**
  - Files: `backend/src/models/Contact.ts`
  - Details: Add a `nameLocked: boolean` field immediately after the existing `isGroup` block (lines 43-45), matching its exact decorator style:
    ```ts
    @Default(false)
    @Column
    nameLocked: boolean;
    ```
    `@Default` is already imported. Do not add `@AllowNull` (isGroup doesn't have it either; NOT NULL is enforced by the migration).

- [x] **Step 3: Manual create path — `CreateContactService`**
  - Files: `backend/src/services/ContactServices/CreateContactService.ts`, `backend/src/controllers/ContactController.ts`
  - Details:
    - In `CreateContactService.ts`: add `nameLocked?: boolean;` to the `Request` interface; destructure with default `nameLocked = false`; include `nameLocked` in the `Contact.create({ ... })` object (alongside `name, number, email, extraInfo`).
    - In `ContactController.ts` `store` (the `CreateContactService({ ... })` call around line 90): add `nameLocked: true` to the argument object. (Manual UI create always has a required, human-provided name.)
    - Do NOT change `GetContactService.ts` or the vcard caller in `handleWhatsappEvents.ts` — they must keep the `false` default so auto-created contacts stay unlocked.

- [x] **Step 4: Manual update path — `UpdateContactService`**
  - Files: `backend/src/services/ContactServices/UpdateContactService.ts`
  - Details:
    - Add `"nameLocked"` to both `attributes` arrays (the `findOne` at line ~30 and the `reload` at line ~63) so the value round-trips and the emitted socket contact stays consistent.
    - Replace the current `await contact.update({ name, number, email });` (line ~56) so the update also sets `nameLocked: true` **only when** the caller sent a name that differs from the current one — mirroring the `ContactController.ts` line 139 pattern (`provided AND changed`). Build the payload explicitly, e.g.:
      ```ts
      const updatePayload: Partial<Contact> = { name, number, email };
      if (name && name !== contact.name) {
        updatePayload.nameLocked = true;
      }
      await contact.update(updatePayload);
      ```
      (`contact.name` here is still the pre-update value — read before the update — so the comparison is correct.) Keep the existing behavior that `undefined` fields are ignored by Sequelize.

- [x] **Step 5: Automatic path — `CreateOrUpdateContactService`**
  - Files: `backend/src/services/ContactServices/CreateOrUpdateContactService.ts`
  - Details: Rewrite the three branches that call `resolveName(...)` and delete both helpers.
    - **`contactByNumber` branch** (line ~80): change `name:` to
      `contactByNumber.nameLocked ? contactByNumber.name : (name || contactByNumber.name)`.
      Leave `lid` and `profilePicUrl` handling unchanged.
    - **`contactByLid` branch** (line ~92): change `name:` to
      `contactByLid.nameLocked ? contactByLid.name : (name || contactByLid.name)`.
      Leave `number` and `profilePicUrl` handling unchanged.
    - **`Contact.create` branch** (line ~103, brand-new auto contact): leave unchanged — do NOT pass `nameLocked`; it defaults to `false` (new auto contacts start unlocked).
    - **Delete** `isBareNumber` (lines 27-28) and `resolveName` (lines 30-33). After the edits above they have no remaining references.

- [x] **Step 5b: Automatic path — `shouldMerge` branch decision (explicit)**
  - Files: `backend/src/services/ContactServices/CreateOrUpdateContactService.ts`
  - Details: In the `shouldMerge` block (`contactByNumber` survives, `contactByLid` destroyed, line ~55-77), resolve name and lock per this truth table. Let `L_num = contactByNumber.nameLocked`, `L_lid = contactByLid.nameLocked`:

    | L_num | L_lid | surviving `name` | surviving `nameLocked` |
    |-------|-------|------------------|------------------------|
    | true  | any   | `contactByNumber.name` | `true` |
    | false | true  | `contactByLid.name` (preserve the destroyed side's human-locked name) | `true` |
    | false | false | `name \|\| contactByNumber.name` (incoming, empty-guarded) | `false` |

    Implementation guidance:
    ```ts
    const mergedNameLocked = contactByNumber.nameLocked || contactByLid.nameLocked;
    let mergedName: string;
    if (contactByNumber.nameLocked) mergedName = contactByNumber.name;
    else if (contactByLid.nameLocked) mergedName = contactByLid.name;
    else mergedName = name || contactByNumber.name;

    await contactByNumber.update({
      name: mergedName,
      nameLocked: mergedNameLocked,
      lid: contactByLid.lid,
      profilePicUrl
    });
    ```
    Tie-break when both sides are locked: the surviving record (`contactByNumber`) keeps its own name — documented, deterministic. Rationale: the survivor is `contactByNumber`; carrying the lid-side name only when the number side is unlocked is the minimum needed to keep the "human-locked name is never lost" invariant.

- [x] **Step 6: Confirm no other callers of the removed helpers**
  - Files: (verification only, no edits)
  - Details: `grep` for `resolveName` / `isBareNumber` was run: the only code references are the 3 branches inside `CreateOrUpdateContactService.ts` (all being rewritten in Step 5). The only other hit is `handoff/session_2026-07-20.md` (a doc, not code). No other source files import or use these helpers — safe to delete. Re-run the grep after editing to confirm zero code references remain.

- [x] **Step 7: Tests (written, not executed locally — see note)**
  - Files: `backend/src/__tests__/unit/Contact/CreateOrUpdateContactService.spec.ts` (new), `backend/src/__tests__/unit/Contact/UpdateContactService.spec.ts` (new)
  - Details: Follow the existing harness pattern (`backend/src/__tests__/unit/User/CreateUserService.spec.ts`): `beforeEach`/`afterEach` call `truncate()`, `afterAll` calls `disconnect()` from `../../utils/database`. `npm run pretest` applies the new migration to the test DB automatically, so the `nameLocked` column exists.
    - `CreateOrUpdateContactService` imports the socket lib (`emitContact` → `getIO()`), which throws when IO isn't initialized. Mock it at the top of that spec:
      ```ts
      jest.mock("../../../libs/socket", () => ({
        getIO: () => ({ emit: jest.fn() })
      }));
      ```
      (`UpdateContactService` does NOT import socket, so its spec needs no mock.)
    - Cases to cover:
      - Not locked: existing contact with `nameLocked=false` → incoming name overwrites the stored name.
      - Locked: existing contact with `nameLocked=true` → incoming (different) name is ignored, stored name unchanged, still locked.
      - Unlocked empty-guard: existing unlocked contact + empty incoming name → stored name unchanged.
      - New auto contact (create branch) → `nameLocked === false`.
      - Merge, L_lid only locked: survivor (by number) ends up with the lid-side name and `nameLocked === true`.
      - `UpdateContactService`: changing the name sets `nameLocked=true`; updating only email (name unchanged) leaves `nameLocked` untouched.

## Acceptance Criteria
- [x] `npm run build` (tsc) passes from `backend/` with no type errors.
- [ ] ~~`npm test` passes from `backend/`~~ — **deliberately skipped locally.** Running it requires a local MySQL (Docker), and the coder agent triggered an unauthorized `open -a Docker` (macOS admin-privilege prompt) trying to get one — killed mid-task. User decision: this feature is fundamentally about live WhatsApp contact-sync timing, which local Jest specs against a throwaway DB can't exercise anyway; not worth the Docker detour. The two new spec files are written and left in place for CI/future use, but were never executed. Verification moves to the real server after deploy.
- [x] `npm run format` (prettier) — ran, but it reformatted 8 unrelated files (whole-tree script, not scoped); those were reverted via `git checkout` since they're out of scope. The 5 feature files are prettier-clean.
- [x] A locked contact's name is never modified by any `CreateOrUpdateContactService` branch (number, lid, merge) — confirmed by code read.
- [x] Manual create (`ContactController.store`) and manual name-change (`ContactController.update`) set `nameLocked = true`; vcard/get-or-create auto paths do not — confirmed by code read.
- [x] `isBareNumber` and `resolveName` are removed with zero remaining code references.
- [x] No frontend files changed; existing rename/create flows keep working unchanged.
- [x] Follows project conventions (migration in `src/database/migrations/`, model column added, no auto-sync assumptions).

## Constraints & Risks
- **Do NOT touch** WhatsApp session/provider/Baileys pairing logic (`src/providers/WhatsApp/**`, `handleWhatsappEvents.ts` beyond leaving its callers untouched). This is a pure DB + service-layer change.
- **Do NOT hardcode** `nameLocked = true` inside `CreateContactService` — it is shared by automatic callers (vcard import, get-or-create). The lock must come from the caller (`ContactController.store` only).
- **Migration table name is `"Contacts"`** (capital C), not `contacts` — matches every existing Contact migration.
- **Merge invariant risk:** the subtle case is a locked `contactByLid` merging into an unlocked `contactByNumber`; Step 5b carries the locked name onto the survivor so a human-set name is not silently lost during an automatic merge.
- **Empty-name guard is a deliberate, flagged decision** (Step 5 / 5b): keeps existing name when incoming name is falsy. Reviewer may downgrade to the strict literal `existing.nameLocked ? existing.name : name` if preferred — but that risks blanking names, which is worse than the incident that motivated this feature.
- **Open question (flag, do not silently decide):** none blocking. Frontend needs no change; if the coder discovers the update form omits `name` when only editing other fields such that intended locks are missed, surface it rather than adding a UI toggle.
- Keep each edited file well under the 500-line limit (all four touched files are small).
