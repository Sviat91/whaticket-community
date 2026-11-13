# Review: safety flush of whaileys event buffer
**Date:** 2026-11-13
**Verdict:** APPROVED (after one fix round)

## Round 1 — Critical (resolved)
- 10s flush timer captured the old `wbot`; after a reconnect within 10s it could flush a dead
  socket's buffer through stale listeners. Fixed via step 3 guard
  `if (sessions.get(sessionId) !== wbot) return;`.

## Minor (accepted)
- Early global flush could split a library-internal `createBufferedFunction` cycle
  (`resyncAppState`, `groupAcceptInviteV4`) into two emissions. No data loss; narrow window.

## Passed Checks
- `flush()` is a no-op when not buffering; later `CB:ib,,offline` flush stays a no-op.
- Types correct (`ev.flush(): Promise<void>`), no `any`; scope limited to one spot; `nameLocked` untouched.
