# Coder Feedback: Optimistic Media Send

## Status: COMPLETE

All three checkboxes in the plan are marked done. Build passes clean (`vite build` — 0 errors, 0 warnings except the pre-existing chunk-size notice).

## Changes Made

### 1. `frontend/src/components/Ticket/index.js`
- Added `useRef` to the React import.
- Added `pendingMessages` state and `pendingRef` ref after existing state declarations.
- Added `handleOptimisticSend` and `handleClearOldestPending` handlers after the drag handlers.
- Passed `pendingMessages` and `onFromMeMessage={handleClearOldestPending}` to `<MessagesList>`.
- Passed `onOptimisticSend={handleOptimisticSend}` to `<MessageInput>`.

### 2. `frontend/src/components/MessageInput/index.js`
- Added `onOptimisticSend` to the props destructuring.
- Rewrote the media branch of `handleSendMessage`: builds pending array, calls `onOptimisticSend`, clears UI immediately, posts fire-and-forget, and returns early. Text branch is unchanged.

### 3. `frontend/src/components/MessagesList/index.js`
- Updated props signature to accept `pendingMessages = []` and `onFromMeMessage`.
- In the `appMessage` socket handler's `"create"` block, added the `fromMe` check that calls `onFromMeMessage()` after `scrollToBottom()`.
- Removed the `index === messagesList.length - 1` case from `renderDailyTimestamps` (that case returned the `lastMessageRef` div, which now lives in JSX).
- Inside `<div id="messagesList">`, after `renderMessages()`: added the `pendingMessages.map(...)` block rendering each pending bubble with image preview and clock icon, followed by `<div ref={lastMessageRef} style={{ float: "left", clear: "both" }} />`.

## Issues Encountered
None. All changes were straightforward and matched the plan exactly.
