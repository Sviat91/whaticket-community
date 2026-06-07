# Plan: UI Overhaul — AVS-Chats

## Goals
1. Rename app: "WhaTicket" → "AVS-Chats" (in-app header + browser tab)
2. Favicon: `/favicon.ico` → `/Favicon.png`
3. Remove Dashboard from nav and routes
4. Theme toggle: replace Switch+icon with image button (Light.png / Dark.png)
5. Fix dark mode for chat window (MessagesList) and input (MessageInput)
6. Improve DarkMode theme: proper dark palette + persist to localStorage

---

## File Changes

### 1. `frontend/index.html`
- `<title>WhaTicket</title>` → `<title>AVS-Chats</title>`
- `<link rel="icon" href="/favicon.ico" />` → `<link rel="icon" href="/Favicon.png" />`
- `<link rel="shortcut icon" href="/favicon.ico" />` → `<link rel="shortcut icon" href="/Favicon.png" />`

### 2. `frontend/src/context/DarkMode/index.js`
Full replacement. Key changes:
- Load initial `darkMode` from `localStorage.getItem("darkMode") === "true"`
- In `toggleTheme`, also save to `localStorage.setItem("darkMode", !prev)`
- Richer theme: include `scrollbarStyles`, primary color, and explicit dark/light palette:

```js
const theme = useMemo(() => createMuiTheme({
  palette: {
    type: darkMode ? "dark" : "light",
    primary: { main: "#25D366" },
    ...(darkMode && {
      background: {
        default: "#111B21",
        paper:   "#1F2C34",
      },
    }),
  },
  scrollbarStyles: {
    "&::-webkit-scrollbar": { width: "6px", height: "6px" },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: darkMode ? "#374045" : "#c1c1c1",
      borderRadius: "3px",
    },
  },
}), [darkMode]);
```

### 3. `frontend/src/App.js`
Remove the ThemeProvider wrapper (DarkMode/index.js handles it now).
Keep the locale useEffect but render just `<Routes />` directly (no wrapping ThemeProvider).

Result:
```js
const App = () => {
  useEffect(() => {
    const i18nlocale = localStorage.getItem("i18nextLng");
    // locale logic stays but unused for now
  }, []);

  return <Routes />;
};
```

### 4. `frontend/src/layout/index.js`
Changes:
- Remove `Brightness4Icon` import (no longer used)
- Add `Switch` removal from imports (unused after change)
- "WhaTicket" → "AVS-Chats"
- Replace theme switch JSX:
  **Before:**
  ```jsx
  <div className={classes.themeSwitchContainer}>
    <Brightness4Icon className={classes.themeIcon} />
    <Switch checked={darkMode} onChange={toggleTheme} ... />
  </div>
  ```
  **After:**
  ```jsx
  <IconButton onClick={toggleTheme} size="small" style={{ padding: 6 }}>
    <img
      src={darkMode ? "/Dark.png" : "/Light.png"}
      alt="toggle theme"
      style={{ width: 32, height: 32, objectFit: "contain" }}
    />
  </IconButton>
  ```
- Remove `switch`, `themeSwitchContainer`, `themeIcon` from makeStyles (or leave unused — prefer remove)
- AppBar: keep existing `backgroundColor: theme.palette.background.default` (works with new dark theme)

### 5. `frontend/src/layout/MainListItems.js`
- Remove the Dashboard `ListItemLink` block (lines with `to="/"`, `primary="Dashboard"`, `icon={<DashboardOutlinedIcon />}`)
- Remove `DashboardOutlinedIcon` import (it becomes unused)

### 6. `frontend/src/routes/index.js`
- Remove `import Dashboard from "../pages/Dashboard/"` 
- Change `<Route exact path="/" component={Dashboard} isPrivate />` to:
  ```jsx
  <Route exact path="/" render={() => <Redirect to="/tickets" />} isPrivate />
  ```
- Add `import { Redirect } from "react-router-dom"` to imports

### 7. `frontend/src/components/MessagesList/index.js`
Use `theme` in makeStyles to fix dark mode colors:

- `messageLeft`:
  - `backgroundColor`: `theme.palette.type === "dark" ? "#202C33" : "#ffffff"`
  - `color`: `theme.palette.text.primary`
  - `boxShadow`: `theme.palette.type === "dark" ? "0 1px 1px #0a0f12" : "0 1px 1px #b3b3b3"`

- `messageRight`:
  - `backgroundColor`: `theme.palette.type === "dark" ? "#005C4B" : "#dcf8c6"`
  - `color`: `theme.palette.text.primary`
  - `boxShadow`: same as above

- `messagesList` (the scroll container):
  - Add `backgroundColor: theme.palette.type === "dark" ? "#0B141A" : undefined`
  - Keep `backgroundImage` but add: `theme.palette.type === "dark" ? "none" : \`url(\${whatsBackground})\``
  - Correct syntax in makeStyles: use a function approach for backgroundImage:
    ```js
    backgroundImage: theme.palette.type === "dark" ? "none" : `url(${whatsBackground})`,
    backgroundColor: theme.palette.type === "dark" ? "#0B141A" : "transparent",
    ```

- `dailyTimestamp`:
  - `backgroundColor`: `theme.palette.type === "dark" ? "#1F2C34" : "#e1f3fb"`

- `dailyTimestampText`:
  - `color`: `theme.palette.text.secondary`

- `quotedContainerLeft`:
  - `backgroundColor`: `theme.palette.type === "dark" ? "#1A272F" : "#f0f0f0"`

- `quotedContainerRight`:
  - `backgroundColor`: `theme.palette.type === "dark" ? "#025144" : "#cfe9ba"`

- `timestamp` color: keep `"#999"` (works in both)

- `ackDoneAllIcon` color: keep green (fine in both)

### 8. `frontend/src/components/MessageInput/index.js`
Fix dark mode:

- `mainWrapper`:
  - `background`: `theme.palette.background.default`

- `newMessageBox`:
  - `background`: `theme.palette.background.default`

- `messageInputWrapper`:
  - `background`: `theme.palette.background.paper`

- `mediaPreview`:
  - `background`: `theme.palette.background.paper`

---

## Checkboxes
- [x] index.html: title + favicon
- [x] DarkMode/index.js: localStorage persist + rich theme
- [x] App.js: remove ThemeProvider wrapper
- [x] layout/index.js: AVS-Chats + image theme toggle
- [x] MainListItems.js: remove Dashboard item
- [x] routes/index.js: remove Dashboard route, add Redirect
- [x] MessagesList/index.js: dark mode colors
- [x] MessageInput/index.js: dark mode colors
