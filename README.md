# Montresor Infni CRM

CRM built with **NocoDB** (data and auth) and **Wooztell** (messaging). This repo is the custom Next.js app (login and future dashboard).

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure NocoDB**
   - Copy `.env.example` to `.env.local`.
   - Set `NOCODB_BASE_URL` to your NocoDB instance (e.g. `https://your-app.nocodb.com` or `http://localhost:8080`).

3. **Create users in NocoDB**
   - In NocoDB, invite users (Account / Workspace) so they can sign in with email/password.
   - Optionally create the **CRM Team Members** table and rows as described in `docs/NOCODB-USER-TABLE-DESIGN.md`.

4. **Run the app**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000). Use **Sign in** to open the login page.

## Login

- The login page calls NocoDB’s auth API: `POST /api/v1/auth/user/signin` with email and password.
- Credentials are the same as in your NocoDB workspace.
- After a successful login you get a token; in production you’d store it in an HTTP-only cookie and redirect to a dashboard.

## NocoDB user table for CRM

See **`docs/NOCODB-USER-TABLE-DESIGN.md`** for:

- Suggested **CRM Team Members** (or **CRM Users**) table structure.
- How it links to NocoDB sign-in (by email).
- Fields for Wooztell (e.g. Wooztell Member Id, Phone) for future integration.

## WhatsApp Inbox (Wooztell)

The **View WhatsApp** / **WhatsApp Inbox** page (`/dashboard/whatsapp-inbox`) shows conversations and messages from Wooztell and lets you reply. No Wooztell branding; tokens stay server-side.

### Setup

1. **Wooztell account and channel**
   - Create a [Wooztell](https://woztell.com) account and a WhatsApp Cloud channel (see `docs/WOOZTELL-WHATSAPP-SETUP.md`).

2. **Access token**
   - In Wooztell: **Settings** → **Access Token**. Create a token with scopes for Open API (conversation history) and Bot API (send).

3. **Environment variables** (in `.env.local`; never commit tokens)
   - `WOOZTELL_API_BASE_URL` — Open API (GraphQL) base URL, e.g. `https://open.api.woztell.com/v3`.
   - `WOOZTELL_API_TOKEN` — Your Wooztell access token.
   - `WOOZTELL_CHANNEL_ID` — Your WhatsApp channel ID (required for sending).
   - Optional: `WOOZTELL_BOT_API_URL` — Bot API base (default: `https://bot.api.woztell.com`).
   - Optional: `WOOZTELL_WEBHOOK_SECRET` — For future webhook signature verification.

4. **Privacy**
   - No message content or phone numbers are written to a database or logged. API routes set `Cache-Control: no-store`.

### API routes (server-only)

- `GET /api/whatsapp/conversations` — List conversations (query: `first`, `after`).
- `GET /api/whatsapp/conversations/:id/messages` — Messages for a conversation (query: `first`, `after`).
- `POST /api/whatsapp/send` — Send text (body: `{ conversationId or to, text }`).

## Next steps

- Add session/cookie after login and redirect to `/dashboard`.
- Build dashboard and fetch **CRM Team Members** by current user email.
- Add Contacts/Leads tables in NocoDB and integrate Wooztell.
