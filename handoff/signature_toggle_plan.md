# Plan: Signature Toggle — New UI Integration

## Goal
Re-integrate the "sign message" toggle into the new UI cleanly.
The toggle appends `*UserName:*\n` to outgoing text messages when active.

## Current state
- `signMessage` via `useLocalStorage("signOption", true)` — already works
- Toggle exists ONLY in the mobile `MoreVertical` menu (hidden on desktop)
- Desktop has NO toggle visible at all
- Default is `true` — user wants `false`

## File to change: `frontend/src/components/MessageInput/index.js`

### Change 1 — Fix default value (line 240)
From:
```js
const [signMessage, setSignMessage] = useLocalStorage("signOption", true);
```
To:
```js
const [signMessage, setSignMessage] = useLocalStorage("signOption", false);
```

### Change 2 — Add `PenLine` to lucide-react imports (line 13)
From:
```js
import { Paperclip, MoreVertical, Smile, Send, XCircle, X, Mic, CheckCircle } from "lucide-react";
```
To:
```js
import { Paperclip, MoreVertical, Smile, Send, XCircle, X, Mic, CheckCircle, PenLine } from "lucide-react";
```

### Change 3 — Add `Tooltip` to MUI imports (line 14-20)
From:
```js
import {
  FormControlLabel,
  Hidden,
  Menu,
  MenuItem,
  Switch,
} from "@material-ui/core";
```
To:
```js
import {
  FormControlLabel,
  Hidden,
  Menu,
  MenuItem,
  Switch,
  Tooltip,
} from "@material-ui/core";
```

### Change 4 — Add toggle button to desktop section

In the `Hidden only={["sm", "xs"]}` block (desktop), after the label for upload-button (around line 533), add the signature toggle button:

```jsx
<Tooltip title={signMessage ? "Подпись: вкл" : "Подпись: выкл"} placement="top">
  <span>
    <IconButton
      aria-label="toggleSignMessage"
      component="span"
      disabled={loading || recording || ticketStatus !== "open"}
      onClick={() => setSignMessage(prev => !prev)}
    >
      <PenLine
        size={20}
        style={{ color: signMessage ? "#25D366" : undefined }}
      />
    </IconButton>
  </span>
</Tooltip>
```

Place this AFTER the upload label block and BEFORE `</Hidden>` of the desktop section.

The exact location — after:
```jsx
            <label htmlFor="upload-button">
              <IconButton
                aria-label="upload"
                component="span"
                disabled={loading || recording || ticketStatus !== "open"}
              >
                <Paperclip size={20} />
              </IconButton>
            </label>
```
...and before `</Hidden>`.

### Change 5 — Replace old toggle in mobile menu

In the `Hidden only={["md", "lg", "xl"]}` block, replace the `FormControlLabel` MenuItem with a clean icon button MenuItem:

From:
```jsx
              <MenuItem onClick={handleMenuItemClick}>
                <FormControlLabel
                  style={{ marginRight: 7, color: "gray" }}
                  label={i18n.t("messagesInput.signMessage")}
                  labelPlacement="start"
                  control={
                    <Switch
                      size="small"
                      checked={signMessage}
                      onChange={e => {
                        setSignMessage(e.target.checked);
                      }}
                      name="showAllTickets"
                      color="primary"
                    />
                  }
                />
              </MenuItem>
```

To:
```jsx
              <MenuItem onClick={() => { setSignMessage(prev => !prev); handleMenuItemClick(); }}>
                <IconButton
                  aria-label="toggleSignMessage"
                  component="span"
                  disabled={loading || recording || ticketStatus !== "open"}
                >
                  <PenLine
                    size={20}
                    style={{ color: signMessage ? "#25D366" : undefined }}
                  />
                </IconButton>
              </MenuItem>
```

---

## Verification
- Default is OFF on first load (localStorage key `signOption` absent or `false`)
- Desktop: PenLine icon visible in toolbar, green when ON, gray when OFF
- Click toggles ON↔OFF, state persists across page reloads
- When ON: message body is `*Name:*\n<text>`; when OFF: just `<text>`
- Tooltip shows current state on hover
- Mobile: tapping the PenLine in the MoreVertical menu toggles same state
