# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
whaticket/
├── backend/   Node.js + Express + TypeScript API
├── frontend/  React (Vite) SPA
└── docker-compose.yaml
```

All active development happens inside `backend/` or `frontend/`. The root only holds Docker orchestration.

---

## Backend

### Commands (run from `backend/`)

```bash
npm run dev          # ts-node-dev with hot reload
npm run build        # tsc — always run before committing
npm run format       # prettier
npm test             # jest (requires running MySQL; runs migrate+seed automatically)
npx sequelize db:migrate          # apply pending migrations
npx sequelize db:seed:all         # seed default admin user
```

After any schema change: create a migration in `src/database/migrations/`, never edit models in place and expect Sequelize to auto-sync.

### Architecture

**Request lifecycle:** `src/routes/` → `src/controllers/` → `src/services/<Domain>/` → Sequelize models in `src/models/`.

**WhatsApp provider abstraction** (`src/providers/WhatsApp/`): the app supports two WhatsApp libraries selected via `WHATSAPP_PROVIDER` env var (`wwebjs` default, `whaileys` alternative). All callers go through the `whatsappProvider` singleton (`whatsappProvider.ts`) which satisfies the `WhatsappProvider` interface. Never call library-specific code outside `Implementations/`.

**Inbound message flow:** WhatsApp library emits events → `src/handlers/handleWhatsappEvents.ts` normalizes them into typed payloads (`MessagePayload`, `ContactPayload`, etc.) → calls service layer → emits socket.io events to connected clients.

**Real-time layer** (`src/libs/socket.ts`): socket.io server initialized once via `initIO()`, retrieved everywhere via `getIO()`. JWT is passed as a query param (`?token=`) during handshake and validated on `connection`. Socket.io CORS is independent of Express CORS — both must be configured if either changes.

**Auth:** HTTP requests use `Authorization: Bearer <jwt>` checked by `src/middleware/isAuth.ts`. Two separate secrets: `JWT_SECRET` (access token) and `JWT_REFRESH_SECRET` (refresh token), set in `.env`.

**Media:** uploaded files land in `backend/public/` (volume-mounted in Docker). `Message.mediaUrl` is a Sequelize getter that prepends `BACKEND_URL` — `BACKEND_URL` must be the full public base URL with no trailing port (e.g. `https://api.example.com`).

**CORS:** `src/app.ts` exports `corsOptions`; `app.options('*', cors(corsOptions))` handles preflight explicitly. If you change allowed origins/methods, update both `app.ts` and the socket.io config in `socket.ts`.

### Key env vars

| Var | Purpose |
|-----|---------|
| `BACKEND_URL` | Full public URL of the API (no trailing slash, no port) |
| `FRONTEND_URL` | Full public URL of the frontend — used for CORS origin |
| `PROXY_PORT` | Public-facing port (e.g. 443); only used by legacy code, not the Message model |
| `CHROME_BIN` | Absolute path to Chrome binary (`/usr/bin/google-chrome-stable` in Docker) |
| `WHATSAPP_PROVIDER` | `wwebjs` (default) or `whaileys` |

### wwebjs session notes

WhatsApp sessions are persisted via `LocalAuth` with `clientId: bd_<whatsapp.id>` stored in `.wwebjs_auth/` (volume-mounted). The deprecated `session` field was removed from `ClientOptions` in newer whatsapp-web.js — do not re-add it. Chrome must be launched with `--no-sandbox --disable-setuid-sandbox` in Docker (set via `CHROME_ARGS`).

---

## Frontend

### Commands (run from `frontend/`)

```bash
npm run dev      # Vite dev server
npm run build    # production build
```

### Env vars

Vite inlines `import.meta.env` at build time. The only mechanism that works is `VITE_*` variables in a `.env` file (or Docker `ARG`/`ENV`). The legacy `window.ENV` / `REACT_APP_*` injection via `.docker/add-env-vars.sh` is dead code for Vite builds — do not use it.

```
VITE_BACKEND_URL=http://localhost:8080
VITE_HOURS_CLOSE_TICKETS_AUTO=
```

`src/config.js` is the single source of truth for reading these vars. `src/services/api.js` creates the axios instance using `getBackendUrl()` from config.

---

## Docker

```bash
docker compose up -d --build          # build and start all services
docker compose up -d --build backend  # rebuild only backend
docker compose exec backend npx sequelize db:seed:all  # first-run seed
```

Production `.env` at repo root must set `BACKEND_URL`, `FRONTEND_URL`, `PROXY_PORT`, `MYSQL_ROOT_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. docker-compose.yaml defaults are insecure placeholders — always override in production.

The backend container listens on port 3000 internally; `BACKEND_PORT` (default 8080) maps it to the host. Nginx inside the frontend container handles SSL termination using certs from `ssl/certs/backend/` and `ssl/certs/frontend/`.
