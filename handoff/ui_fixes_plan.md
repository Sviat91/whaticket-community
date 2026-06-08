# Plan: UI Bug Fixes Batch (Dark Mode + Layout + Chat)
**Date:** 2026-06-08
**Status:** In Progress

## Goal
Fix 8 specific UI bugs in the Whaticket React/Material-UI v4 frontend: dark-mode background bleed-through, palette colors, layout rail/toggle sizing, anti-flash on load, file-message rendering, in-chat image framing, desktop sign-toggle removal, and chat-list width.

## Architecture Decisions
- **No new dependencies.** All fixes use existing MUI v4 theming (`makeStyles`, `theme.palette.*`), existing imports, and a single inline `<head>` script in `index.html`.
- **Theme-driven colors:** Replace hardcoded hex/rgba values with `theme.palette.*` tokens so light and dark modes both resolve correctly. The single source of palette truth is `src/context/DarkMode/index.js` — fix it there first so downstream `theme.palette.background.*` references behave.
- **Anti-flash strategy:** A synchronous inline script in `<head>` reads `localStorage.darkMode` (the same key `DarkMode/index.js` uses) and sets `documentElement.style.backgroundColor` before React mounts. This must run before any paint, so it goes first inside `<head>`.
- **Tickets layout:** Replace the MUI `Grid` percentage grid with a plain flex layout using inline styles, driven by `ticketId` presence. Fixed 360px list when no ticket is open; collapses to 0 when a ticket is open.
- **Orphan cleanup:** Each step lists exactly which imports become unused after the change. Remove only imports orphaned BY these changes; do not touch unrelated pre-existing dead/commented code.

## Implementation Steps

- [x] Step 1: Fix DarkMode palette (do this FIRST — other steps depend on correct `background.*` tokens)
  - Files: `frontend/src/context/DarkMode/index.js`
  - Details: In the `createMuiTheme` `palette` object (lines ~21-30):
    - Change `primary: { main: "#25D366" }` → `primary: { main: darkMode ? "#00a884" : "#008069" }`
    - Replace the spread block:
      ```js
      ...(darkMode && {
        background: { default: "#111B21", paper: "#1F2C34" },
      }),
      ```
      with:
      ```js
      ...(darkMode
        ? { background: { default: "#111B21", paper: "#202c33" } }
        : { background: { default: "#f0f2f5", paper: "#ffffff" } }),
      ```
    - Note: dark `paper` changes from `#1F2C34` to `#202c33`; dark `default` stays `#111B21`; explicit light-mode `background` is now added.
  - Verify: app compiles; dark mode shows WhatsApp green `#00a884`; light mode background `#f0f2f5`.

- [x] Step 2: ContactDrawer — remove hardcoded `#eee` and rgba borders
  - Files: `frontend/src/components/ContactDrawer/index.js`
  - Details: In `useStyles` (lines ~27-53):
    - `drawerPaper`: replace the three border lines (`borderTop`/`borderRight`/`borderBottom` using `rgba(0, 0, 0, 0.12)`) so each uses `theme.palette.divider`, e.g. `borderTop: \`1px solid ${theme.palette.divider}\``, same for `borderRight` and `borderBottom`.
    - `header` (line 39): `backgroundColor: "#eee"` → `backgroundColor: theme.palette.background.paper`. Also change `header`'s `borderBottom: "1px solid rgba(0, 0, 0, 0.12)"` (line 38) → `borderBottom: \`1px solid ${theme.palette.divider}\``.
    - `content` (line 47): `backgroundColor: "#eee"` → `backgroundColor: theme.palette.background.default`.
  - Verify: drawer header/content adopt dark backgrounds in dark mode; borders use theme divider.

- [x] Step 3: Layout rail background + theme toggle size
  - Files: `frontend/src/layout/index.js`
  - Details: In `useStyles`:
    - `rail.backgroundColor` (line 27): `theme.palette.background.paper` → `theme.palette.background.default`.
    - `themeToggle` (lines 57-58): `width: 36` → `width: 50`, `height: 28` → `height: 40`. Leave all other `themeToggle` props unchanged.
  - Verify: rail matches page background; toggle image is visibly larger.

- [x] Step 4: Anti-flash inline script in index.html
  - Files: `frontend/index.html`
  - Details: Insert this script as the FIRST child inside `<head>`, immediately after `<head>` (before the `<title>` on line 4):
    ```html
    <script>
      (function() {
        try {
          var dark = localStorage.getItem('darkMode') === 'true';
          if (!dark && window.matchMedia)
            dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.style.backgroundColor = dark ? '#111b21' : '#f0f2f5';
        } catch(e) {}
      })();
    </script>
    ```
  - Note: the `localStorage` key is `darkMode` (string `'true'`) — matches `DarkMode/index.js`. Colors match the palette `background.default` values from Step 1.
  - Verify: hard refresh on a dark-mode session shows no white flash before React mounts.

- [x] Step 5: MessagesList — document card instead of green DOWNLOAD button
  - Files: `frontend/src/components/MessagesList/index.js`
  - Details:
    - Replace the entire `else` branch of `checkMessageMedia` (lines 491-508, the block rendering `<div className={classes.downloadMedia}><Button …>Download</Button></div>` + `<Divider />`) with:
      ```jsx
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
      ```
    - In `useStyles` (object ends at line 263), ADD the `docCard`, `docIconBadge`, `docExt`, `docName` styles exactly as given in the spec (use `theme.palette.type === "dark" ? "#374045" : "#e0e0e0"` for `docIconBadge.backgroundColor`, and `theme.palette.text.secondary` for `docExt.color`). You may keep or remove the now-unused `downloadMedia` style (lines 256-262); since it is orphaned by this change, remove it.
    - Orphaned imports to REMOVE (verified used ONLY in the deleted branch): `Button` and `GetApp` (line 21 in the import block). DO NOT remove `Divider` (line 11) — it is still referenced indirectly? Re-verify: `<Divider />` JSX appears ONLY at the deleted line 505; `renderMessageDivider` is an unrelated function name. So `Divider` is also orphaned — remove the `Divider` import too. Confirm with a grep for `<Divider` / `Button` / `GetApp` after editing; remove only those whose JSX count drops to zero.
  - Verify: app compiles with no unused-import lint errors; a non-image/non-audio/non-video file message renders as a clickable EXT-badge card, no green button, no divider.

- [x] Step 6: ModalImageCors — remove white frame around in-chat images
  - Files: `frontend/src/components/ModalImageCors/index.js`
  - Details:
    - Replace the four `borderTop/Bottom/Left/Right Radius: 8` lines in `messageMedia` (lines 12-15) with a single `borderRadius: 8,` and add `display: "block",`. Resulting `messageMedia`:
      ```js
      messageMedia: {
        objectFit: "cover",
        width: 250,
        height: 200,
        borderRadius: 8,
        display: "block",
      },
      ```
    - ADD a new style key `imageWrapper`:
      ```js
      imageWrapper: {
        "& > span, & > div, & img": {
          borderRadius: 8,
          display: "block",
        },
        "& > span": {
          backgroundColor: "transparent !important",
        },
      },
      ```
    - Wrap the returned `<ModalImage … />` in `<div className={classes.imageWrapper}> … </div>`. Keep the `className={classes.messageMedia}` prop on `ModalImage` and all its existing props (`smallSrcSet`, `medium`, `large`, `alt`).
  - Verify: in-chat image has rounded corners and no white box/frame in dark mode.

- [x] Step 7: MessageInput — remove desktop Sign toggle + simplify placeholder
  - Files: `frontend/src/components/MessageInput/index.js`
  - Details:
    - Remove the `<FormControlLabel … signMessage … />` block at lines 540-555, which sits inside `<Hidden only={["sm", "xs"]}>` (desktop). Do NOT touch the mobile `MoreVert` menu in `<Hidden only={["md", "lg", "xl"]}>` (lines 557+) — the Sign toggle there stays.
    - Placeholder: the `InputBase` `placeholder` prop (lines 628-632) currently switches on `ticketStatus === "open"` between `placeholderOpen` and `placeholderClosed`. **DISCREPANCY NOTE for coder:** the spec describes the placeholder as a conditional translation key tied to signing, but the actual code conditions on ticket open/closed state. Per the spec intent ("always use 'Type a message'"), replace the entire conditional with the literal `placeholder="Type a message"`. This drops the open/closed distinction — acceptable per spec.
    - Orphan check: `FormControlLabel` and `Switch` may still be imported. Grep for `<FormControlLabel` and `<Switch` after removing the desktop block — the mobile menu likely still uses `Switch`/`FormControlLabel` for its own Sign toggle, so verify before removing imports. Remove an import ONLY if its JSX usage count reaches zero. Likewise, if `placeholderOpen`/`placeholderClosed` were the only `i18n` usages they are NOT (i18n is used widely) — leave `i18n` import.
  - Verify: desktop message bar has no Sign switch; mobile MoreVert menu Sign toggle unchanged; input placeholder reads "Type a message".

- [x] Step 8: Tickets page — fixed 360px chat list width via flex
  - Files: `frontend/src/pages/Tickets/index.js`
  - Details:
    - Replace the `<Grid container …>…</Grid>` block (lines 74-101) inside `chatPapper` with:
      ```jsx
      <div style={{ display: "flex", height: "100%", width: "100%" }}>
        <div style={{
          width: ticketId ? 0 : 360,
          minWidth: ticketId ? 0 : 360,
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
      ```
    - Keep the outer `chatContainer` + `chatPapper` wrapper divs unchanged.
    - Remove now-unused imports: `Grid` (line 3) and `Hidden` (line 11) — both verified used ONLY in the replaced block. KEEP `Paper` (line 4, reused in new JSX) and `i18n`.
    - Keep `useStyles` keys `chatContainer`, `chatPapper`, `welcomeMsg`. The keys `contactsWrapper`, `contactsWrapperSmall`, `messagessWrapper`, `ticketsManager`, `ticketsManagerClosed` become unused; remove them since they are orphaned by this change.
  - Verify: chat list is a fixed 360px when no ticket open; collapses to 0 and the conversation fills the pane when a ticket is open; app compiles with no unused-import/lint errors.

- [x] Step 9: Build verification
  - Files: n/a
  - Details: From `frontend/`, run `npm run build`. Fix any unused-import or syntax errors introduced.
  - Verify: production build succeeds.

## Acceptance Criteria
- [x] `npm run build` passes from `frontend/` with no new errors
- [x] Follows project conventions (MUI v4 `makeStyles`, `theme.palette.*`, existing import style/tabs)
- [x] Dark mode: no `#eee`/white backgrounds in ContactDrawer, layout rail matches page bg, palette uses `#00a884` / `#202c33` / `#111B21`
- [x] Light mode: background `#f0f2f5` / paper `#ffffff`, primary `#008069`
- [x] No white flash on hard refresh in dark mode
- [x] File (non-image/audio/video) messages render as an EXT-badge document card, not a green DOWNLOAD button, and no trailing Divider
- [x] In-chat images have rounded corners with no white frame
- [x] Desktop message bar has no Sign toggle; mobile MoreVert Sign toggle still present; placeholder reads "Type a message"
- [x] Chat list is fixed 360px (collapses to 0 with an open ticket); conversation fills remaining space
- [x] All imports orphaned BY these changes are removed; no unrelated pre-existing dead code touched

## Constraints & Risks
- **Do Step 1 first.** Steps 2-3 rely on corrected `theme.palette.background.*` tokens.
- **localStorage key contract:** the anti-flash script (Step 4) MUST use key `darkMode` and compare to string `'true'` to match `DarkMode/index.js`. The hex colors in the script MUST match the palette `background.default` values (`#111b21` dark / `#f0f2f5` light).
- **Do NOT touch** the mobile `MoreVert` Sign toggle (Step 7) or the `<Hidden only={["md","lg","xl"]}>` block.
- **Spec discrepancy (Step 7):** the real placeholder conditions on ticket open/closed, not signing. Coder applies the literal "Type a message" per spec intent but should be aware this removes the open/closed placeholder distinction.
- **Orphan-import care:** `Switch`/`FormControlLabel` (MessageInput) and `Divider` (MessagesList) may still be used by other JSX — grep usage counts before deleting any import. Remove an import only when its JSX usage count reaches zero.
- **Surgical edits only:** ignore the many pre-existing commented-out lines (e.g. in `Tickets/index.js`); do not clean them up.
- **No backend changes**, no new dependencies, no translation-file edits required.
