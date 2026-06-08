# Plan: TicketsManager Redesign + Rail Polish

## Goal
Polish the left rail and redesign TicketsManager header to match WhatsApp Web style.

## Files to change

### 1. `frontend/src/layout/index.js`
- Make `themeToggle` image bigger: `width: 36, height: 28` (was 34×22)
- Make `logoutBtn` padding match NavBtn: `padding: 9` (was 6), `fontSize="small"` already correct

### 2. `frontend/src/layout/MainListItems.js`
- Remove the Queues `<NavBtn>` entry (`to="/Queues"`, `AccountTreeOutlinedIcon`)
- Also remove `AccountTreeOutlinedIcon` import
- Replace `@material-ui/icons` imports with `lucide-react` equivalents:
  - `SyncAltIcon` → `{ ArrowLeftRight }` from lucide-react
  - `WhatsAppIcon` → keep as-is (no lucide equivalent, brand icon)
  - `ContactPhoneOutlinedIcon` → `{ Users }` from lucide-react
  - `QuestionAnswerOutlinedIcon` → `{ MessageSquare }` from lucide-react
  - `PeopleAltOutlinedIcon` → `{ UserCog }` from lucide-react
  - `SettingsOutlinedIcon` → `{ Settings }` from lucide-react
- Icon size for lucide: use `size={18}` prop instead of `fontSize="small"`
- WhatsApp icon stays as `WhatsAppIcon` from @material-ui/icons (brand icon, no replacement)

### 3. `frontend/src/components/TicketsManager/index.js`
Full rewrite. New structure:

**Header row** (flex row, space-between):
- Left: Typography "Chats" (font-weight 600, ~16px)
- Right: two icon buttons:
  - Compose icon (`SquarePen` from lucide-react, size 20) → opens NewTicketModal
  - MoreVert (`MoreVertical` from lucide-react, size 20) → opens MUI Menu

**MUI Menu** (three-dot) contains:
- TicketsQueueSelect wrapped in MenuItem (queue filter, preserved functionality)

**Search bar** (always visible, full width):
- Rounded pill input (`border-radius: 8px`)
- Search icon (`Search` from lucide-react) on left
- `InputBase` for text input
- Background: `theme.palette.background.default`
- Triggers search mode when user types (existing `handleSearch` logic)

**Filter chips row** (flex row, gap 8):
- Two chips: "All" and "Unread"  
- Active chip: filled with `theme.palette.primary.main` color, white text
- Inactive chip: transparent, text `theme.palette.text.secondary`
- Chip is a styled `<button>` element (no MUI Chip to keep it simple)
- State: `const [filterUnread, setFilterUnread] = useState(false)`

**Content area**:
- When `searchParam` is non-empty: show search TicketsList
- When `filterUnread = true`: show TicketsList with `withUnreadMessages="true"`
- Default: show open TicketsList

Remove: Tabs component, TabPanel, Tab imports, separate search/open TabPanels.
Keep: NewTicketModal, TicketsList, TicketsQueueSelect (inside Menu).

### 4. `frontend/src/components/TicketsList/index.js`
- Line 156: destructure `withUnreadMessages` from props alongside existing props
- Line 163: add `withUnreadMessages` to the `useEffect` deps array (line 166)
- Line 168: pass `withUnreadMessages` to `useTickets({...})` call
- Line 177: update the guard condition to also re-trigger when `withUnreadMessages` changes

**Exact change at line 156:**
```js
const { status, searchParam, showAll, selectedQueueIds, updateCount, style, withUnreadMessages } = props;
```
**At line 168-174** (useTickets call):
```js
const { tickets, hasMore, loading } = useTickets({
    pageNumber,
    searchParam,
    status,
    showAll,
    queueIds: JSON.stringify(selectedQueueIds),
    withUnreadMessages,
});
```
**At line 163-166** (useEffect deps):
```js
useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
}, [status, searchParam, dispatch, showAll, selectedQueueIds, withUnreadMessages]);
```

## Checkboxes
- [x] layout/index.js — themeToggle + logoutBtn size
- [x] layout/MainListItems.js — remove Queues, replace icons with lucide-react
- [x] TicketsList/index.js — add withUnreadMessages prop
- [x] TicketsManager/index.js — full WhatsApp header rewrite
