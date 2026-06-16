# wa-bridge Setup (WhatsApp Connect + QR)

If you run **wa-bridge** on a VPS (e.g. for n8n), the CRM can use it to show the QR code and store each user's connected WhatsApp number in NocoDB.

## 1. Set WA_BRIDGE_URL

In `.env.local`:

```env
WA_BRIDGE_URL=http://72.62.163.6:3001
```

Use your wa-bridge base URL **without** a trailing slash. The CRM will call it for:

- **Start session:** `POST /start` or `POST /connect` with `{ sessionId: "user_<nocodb_user_id>_whatsapp_1" }`.
- **Status / QR:** `GET /api/session-status?sessionId=user_<id>_whatsapp_1` or `GET /api/session-info/user_<id>_whatsapp_1` — response should include `connected`, `phone`, and `qr` when available.
- **Disconnect:** `POST /api/logout-session` with `{ sessionId: "user_<nocodb_user_id>_whatsapp_1" }` (calls `logout()`, destroys client, removes session from memory).

For **whatsapp-web.js Bailey bridge** (Docker on VPS, port 3003), set:

```env
WA_BRIDGE_URL=http://YOUR_VPS_IP:3003
WA_BRIDGE_API_KEY=your-key
```

Deploy from `scripts/bailey-bridge/`:

```bash
cd scripts/bailey-bridge
docker compose up -d --build
```

This bridge uses `LocalAuth`, cleans Chromium lock files on reconnect, and exposes:
- `POST /api/start-session`
- `POST /api/logout-session` (logout + destroy + remove auth folder)
- `GET /api/session-status` / `GET /api/session-info/:sessionId` (read-only, never starts clients)

For **Baileys bridge** (alternative, no Chromium), use `scripts/baileys-server/` instead.

The CRM calls **POST** `/api/start-session` with `{ sessionId: "user_<nocodb_user_id>_whatsapp_1" }`. QR generation can take 10–30 seconds, so the app uses a longer start timeout (`WHATSAPP_START_TIMEOUT_MS=30000` by default).

For `avoylenko/wwebjs-api`, the CRM also supports:
- **Start session:** `GET /session/start/:slot`
- **Status:** `GET /session/status/:slot`
- **QR image:** `GET /session/qr/:slot/image`
- **Stop / terminate:** `GET /session/stop/:slot` or `GET /session/terminate/:slot`

If your wa-bridge uses different paths, the app tries several common patterns; if none work, you may need to align the bridge’s API with these or add custom path env vars later.

## 2. Fix "Not Found" — set your bridge paths

If you see **Not Found** when clicking Connect, your wa-bridge uses different API paths. In `.env.local` set:

- **WA_BRIDGE_START_PATH** — exact path for starting a session (POST). Example: `/api/start-session`.
- **WA_BRIDGE_STATUS_PATH** — path for status/QR (GET). Use `:sessionId` if your bridge supports it. Example: `/api/session/:sessionId`.

Check your wa-bridge docs or source for the real endpoints, then set these so the CRM can start the session and fetch the QR.

## 2b. Forward inbound/outbound messages to NocoDB

Set your bridge webhook to:

`https://YOUR_CRM_DOMAIN/api/whatsapp/bridge-webhook`

This endpoint accepts bridge callback events and upserts both conversation/message rows into:
- `WhatsApp_Conversations`
- `WhatsApp_Messages`

Optional hardening:
- Set `WA_BRIDGE_WEBHOOK_SECRET` in CRM
- Send the same value in `x-bridge-secret` (or `x-api-key`) from your bridge/webhook forwarder

## 3. NocoDB table (per-user connections)

Create the **Connect_whatsapp** table in NocoDB and add `NOCODB_WHATSAPP_CONNECTIONS_TABLE_ID` if you use a different name/ID. See **docs/NOCODB-WHATSAPP-CONNECTIONS-TABLE.md**.

Each logged-in user gets one row keyed by `User_ID` (NocoDB Users `Id`) and `SessionID` (`user_<id>_whatsapp_1`).

### Migrate legacy slot / email SessionID rows

```bash
npm run migrate:whatsapp-connections -- --dry-run
npm run migrate:whatsapp-connections
```

Use `--delete` to remove legacy slot rows instead of marking them disconnected.

## 4. n8n webhook payload

When `WHATSAPP_INBOUND` / `WHATSAPP_OUTBOUND` are set, the CRM forwards messages with:

- `userId` — NocoDB Users `Id` (no parsing required)
- `sessionId` — e.g. `user_42_whatsapp_1`
- `whatsappNumber` / `connectedLineNumber` — the user's linked WhatsApp line
- `direction` — `in` or `out`
- `from`, `to`, `body`

## 5. Baileys auth persistence on VPS

If you run the bundled Baileys server in Docker, auth state must survive restarts:

```bash
cd scripts/baileys-server
docker compose up -d
```

`docker-compose.yml` mounts a named volume `baileys_auth_data` to `/data/auth` (`BAILEYS_AUTH_DIR`). Session folders are stored as `auth_user_<id>_whatsapp_1/` inside that volume.

For the bundled **wa-bridge** service (`wa-bridge/docker-compose.yml`), auth is stored under `SESSION_DIR` (default `/data/sessions`) via the `wa_bridge_sessions` named volume.

For an existing VPS Bailey bridge, confirm your container bind-mounts or uses a named volume for the auth/sessions directory — not the container's ephemeral filesystem. Without a volume, WhatsApp sessions are lost on every container restart or VPS reboot.

## 6. Flow

1. User opens **WhatsApp Connect** and clicks **Connect**.
2. CRM derives `sessionId` from the logged-in user's NocoDB `Id` and calls wa-bridge to start the session.
3. User scans the QR; when connected, the CRM saves the phone number to **Connect_whatsapp**.
4. Inbound/outbound messages are forwarded to n8n with `userId`, `sessionId`, and `connectedLineNumber` included explicitly.
