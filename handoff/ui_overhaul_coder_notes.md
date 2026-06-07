# UI Overhaul Coder Notes

All 8 changes implemented and build passes (no errors, only existing chunk-size warnings unrelated to this work).

## Changes Made

### 1. `frontend/index.html`
- Title changed: "WhaTicket" → "AVS-Chats"
- Both favicon links changed from `/favicon.ico` to `/Favicon.png`

### 2. `frontend/src/context/DarkMode/index.js`
- Initial state reads `localStorage.getItem("darkMode") === "true"`
- `toggleTheme` now calls `localStorage.setItem("darkMode", !prev)` before flipping state
- Theme upgraded: added `primary: { main: "#25D366" }`, dark background overrides (`#111B21` / `#1F2C34`), and `scrollbarStyles` with 6px scrollbars

### 3. `frontend/src/App.js`
- Removed `createTheme`, `ThemeProvider`, `ptBR`, `useState`, and `locale` variable
- Kept the `useEffect` for locale (body is now a no-op comment per plan)
- Component returns `<Routes />` directly

### 4. `frontend/src/layout/index.js`
- Removed `Brightness4Icon` import and `Switch` from `@material-ui/core` import list
- Removed `switch`, `themeSwitchContainer`, `themeIcon` style classes from `makeStyles`
- "WhaTicket" → "AVS-Chats" in the `<Typography>` heading
- Theme toggle replaced: `<div>` with `<Brightness4Icon>` + `<Switch>` → single `<IconButton>` containing `<img src={darkMode ? "/Dark.png" : "/Light.png"}>`

### 5. `frontend/src/layout/MainListItems.js`
- Removed `DashboardOutlinedIcon` import
- Removed the Dashboard `<ListItemLink to="/" primary="Dashboard" ...>` block

### 6. `frontend/src/routes/index.js`
- Added `Redirect` to `react-router-dom` import
- Removed `import Dashboard from "../pages/Dashboard/"`
- Changed `<Route exact path="/" component={Dashboard} isPrivate />` to `<Route exact path="/" render={() => <Redirect to="/tickets" />} isPrivate />`

### 7. `frontend/src/components/MessagesList/index.js`
- `messagesList`: `backgroundImage` now uses ternary (none in dark), added `backgroundColor` ternary (`#0B141A` dark)
- `messageLeft`: `backgroundColor` (`#202C33` dark / `#ffffff` light), `color` uses `theme.palette.text.primary`, `boxShadow` uses ternary
- `messageRight`: `backgroundColor` (`#005C4B` dark / `#dcf8c6` light), `color` uses `theme.palette.text.primary`, `boxShadow` uses ternary
- `quotedContainerLeft`: `backgroundColor` (`#1A272F` dark / `#f0f0f0` light)
- `quotedContainerRight`: `backgroundColor` (`#025144` dark / `#cfe9ba` light)
- `dailyTimestamp`: `backgroundColor` (`#1F2C34` dark / `#e1f3fb` light)
- `dailyTimestampText`: `color` uses `theme.palette.text.secondary`

### 8. `frontend/src/components/MessageInput/index.js`
- `mainWrapper.background`: `theme.palette.background.default`
- `mediaPreview.background`: `theme.palette.background.paper`
- `newMessageBox.background`: `theme.palette.background.default`
- `messageInputWrapper.background`: `theme.palette.background.paper`

## Build Result
`npm run build` completed successfully in 6.50s with no errors.
