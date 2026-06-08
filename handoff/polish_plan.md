# Plan: UI Polish — Skeletons, Icons, D&D Overlay

## Goal
Replace remaining @material-ui/icons with lucide-react, add skeleton loaders, polish D&D overlay.

## Files to change

### 1. `frontend/src/components/MessagesList/index.js`

Replace the `loading && <CircularProgress />` block (lines 730-734) with skeleton bubbles.

**Remove:**
- `circleLoading` style (lines 55-62)
- `CircularProgress` from import (line 9)

**Add import:**
```js
import Skeleton from "@material-ui/lab/Skeleton";
```

**Replace the loading block at the bottom of the return (currently `{loading && (<div><CircularProgress .../></div>)}`):**
```jsx
{loading && (
  <div style={{ padding: "20px 20px 0 20px" }}>
    {[
      { fromMe: false, w: 180 },
      { fromMe: true,  w: 240 },
      { fromMe: false, w: 130 },
      { fromMe: true,  w: 200 },
      { fromMe: false, w: 160 },
      { fromMe: true,  w: 110 },
    ].map((item, i) => (
      <div key={i} style={{
        display: "flex",
        justifyContent: item.fromMe ? "flex-end" : "flex-start",
        marginBottom: 6,
      }}>
        <Skeleton
          variant="rect"
          width={item.w}
          height={36}
          style={{ borderRadius: item.fromMe ? "8px 8px 0 8px" : "0 8px 8px 8px" }}
        />
      </div>
    ))}
  </div>
)}
```

---

### 2. `frontend/src/components/Ticket/index.js`

Improve the D&D overlay (lines 187-197). Keep state logic unchanged.

**Replace the isDraggingOver overlay div with:**
```jsx
{isDraggingOver && (
  <div style={{
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    color: "#fff",
    pointerEvents: "none",
    border: "3px dashed rgba(255,255,255,0.5)",
    boxSizing: "border-box",
    margin: 12,
    borderRadius: 12,
  }}>
    <Upload size={48} style={{ marginBottom: 12, opacity: 0.9 }} />
    <span style={{ fontSize: "1.2rem", fontWeight: 600 }}>Drop files here</span>
  </div>
)}
```

**Add import:**
```js
import { Upload } from "lucide-react";
```

---

### 3. `frontend/src/components/MessageInput/index.js`

Replace all `@material-ui/icons` imports with lucide-react equivalents.

**Remove these imports:**
```js
import AttachFileIcon from "@material-ui/icons/AttachFile";
import MoreVert from "@material-ui/icons/MoreVert";
import MoodIcon from "@material-ui/icons/Mood";
import SendIcon from "@material-ui/icons/Send";
import CancelIcon from "@material-ui/icons/Cancel";
import ClearIcon from "@material-ui/icons/Clear";
import MicIcon from "@material-ui/icons/Mic";
import CheckCircleOutlineIcon from "@material-ui/icons/CheckCircleOutline";
import HighlightOffIcon from "@material-ui/icons/HighlightOff";
```

**Add single lucide import:**
```js
import { Paperclip, MoreVertical, Smile, Send, XCircle, X, Mic, CheckCircle } from "lucide-react";
```

**Replace icon usages (size={20} for all):**
- `<AttachFileIcon className={classes.sendMessageIcons} />` → `<Paperclip size={20} />`
- `<MoreVert>` → `<MoreVertical size={20} />`
- `<MoodIcon className={classes.sendMessageIcons} />` → `<Smile size={20} />`
- `<SendIcon className={classes.sendMessageIcons} />` → `<Send size={20} />`
- `<CancelIcon style={{ fontSize: 14 }} />` → `<X size={14} />`
- `<ClearIcon className={classes.sendMessageIcons} />` → `<X size={20} />`
- `<MicIcon className={classes.sendMessageIcons} />` → `<Mic size={20} />`
- `<CheckCircleOutlineIcon className={classes.sendAudioIcon} />` → `<CheckCircle size={20} style={{ color: "green" }} />`
- `<HighlightOffIcon className={classes.cancelAudioIcon} />` → `<XCircle size={20} style={{ color: "red" }} />`

Note: `sendMessageIcons`, `cancelAudioIcon`, `sendAudioIcon` styles become unused on the icons themselves, but the style keys can stay (they may be used elsewhere or harmless). Keep the color styles inline on the icons.

---

### 4. `frontend/src/components/TicketHeader/index.js`

**Remove:**
```js
import ArrowBackIos from "@material-ui/icons/ArrowBackIos";
```

**Add:**
```js
import { ArrowLeft } from "lucide-react";
```

**Replace:**
```jsx
<ArrowBackIos />
```
with:
```jsx
<ArrowLeft size={20} />
```

---

## Checkboxes
- [x] MessagesList — CircularProgress → Skeleton bubbles
- [x] Ticket — D&D overlay improved with Upload icon
- [x] MessageInput — all @material-ui/icons → lucide-react
- [x] TicketHeader — ArrowBackIos → ArrowLeft
