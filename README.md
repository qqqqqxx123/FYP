# AI.S.D.S Portal

A Next.js portal for user/admin operations, WhatsApp connection management, and message workflow integrations.

## What This Project Is

This repository is an internal web portal (not a CRM system).  
It provides:

- OTP-based login flow
- User dashboard pages
- WhatsApp Connect (multi-slot)
- WhatsApp Inbox
- Admin user management
- Security news panel

## Tech Stack

- Next.js 14 (App Router)
- React 18 + TypeScript
- Tailwind CSS
- NocoDB (users + portal data)
- Wooztell APIs
- WhatsApp bridge services (wa-bridge / wwebjs bridge / Baileys bridge)

## Local Setup

1. Install dependencies
   ```bash
   npm install
   ```

2. Create local env file
   ```bash
   cp .env.example .env.local
   ```
   PowerShell:
   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Fill required `.env.local` values
   - `NOCODB_BASE_URL`
   - `NOCODB_API_TOKEN` (or `NOCODB_XC_TOKEN`)
   - `NOCODB_BASE_ID`
   - `NOCODB_USERS_TABLE_ID`
   - `WA_BRIDGE_URL` (or `BAILEYS_API_URL` / `BAILEY_API_URL`)

4. Start dev server
   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`

## Core Modules

### Login

- OTP request + verify flow
- Session cookie-based auth
- Supports webhook-based auth orchestration

### WhatsApp Connect

- Up to 5 connection slots per user
- Connect / disconnect / remove slot
- Slot state stored in NocoDB (`Connect_whatsapp`)
- Remove slot shows loading state while delete is in progress

### WhatsApp Inbox

- Multi-session support via session switcher
- Conversation + message view
- Handles direct and group chat mapping
- Send messages from portal UI

### Admin Portal

- User list and status management
- Connected WhatsApp visibility per user
- Shows currently connected number(s) only

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run backend:start
npm run migrate:whatsapp-connections
```

## Deploy to VPS (GitHub)

1. Push this repo to GitHub
2. SSH into VPS and install Node.js 20+, Nginx, PM2
3. Clone repo and configure `.env.local`
4. Build and run with PM2:
   ```bash
   npm ci
   npm run build
   pm2 start npm --name ring3-portal -- start
   pm2 save
   ```
5. Configure Nginx reverse proxy to `127.0.0.1:3000`
6. Enable HTTPS (Certbot)
7. Optional: run WhatsApp bridge with Docker from `scripts/bailey-bridge`

## Important Docs

- `docs/WA-BRIDGE-SETUP.md`
- `docs/NOCODB-WHATSAPP-CONNECTIONS-TABLE.md`
- `docs/NOCODB-WHATSAPP-INBOX-TABLES.md`
- `docs/WOOZTELL-WHATSAPP-SETUP.md`

## Notes

- Keep `.env.local` private (never commit secrets)
- Use production webhook URLs for live deployment
- Ensure HTTPS is enabled in production for secure auth cookies
