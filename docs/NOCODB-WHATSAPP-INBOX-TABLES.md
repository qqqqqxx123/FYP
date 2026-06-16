# NocoDB Tables: WhatsApp Inbox (Conversations + Messages)

Create these tables in your NocoDB base to **cache** all conversations and messages fetched from the Wooztell API. The app can then read from NocoDB first to reduce Wooztell calls and improve speed.

---

## 1. Table: **WhatsApp_Conversations**

Stores one row per conversation (chat). The Wooztell conversation id is the composite key (e.g. `85261234567_85268765432`).

| Column title      | NocoDB type   | Notes |
|-------------------|---------------|--------|
| **Id**            | Auto (default)| Primary key. Leave as is. |
| **Conversation_Id** | SingleLineText | **Unique.** Wooztell conversation id (e.g. `from_to` sorted). Used to upsert and look up. |
| **Name**          | SingleLineText | Contact display name (from API or contacts). |
| **Whatsapp_number** | SingleLineText | Other party WhatsApp number (customer). |
| **Last_Message**  | LongText      | Preview of latest message. |
| **Updated_Time** | SingleLineText or Number | Wooztell `updatedAt` (timestamp string or epoch ms). Used for sorting “newest first”. |
| **Synced_At**     | DateTime      | When we last synced this row from Wooztell. Optional. |

- **Unique:** `Conversation_Id` (so one row per conversation).
- **Suggested table name:** `WhatsApp_Conversations` (or set `NOCODB_WHATSAPP_CONVERSATIONS_TABLE_ID` to the table ID after creation).

---

## 2. Table: **WhatsApp_Messages**

Stores one row per message. Linked to a conversation by `Conversation_Id`.

| Column title      | NocoDB type   | Notes |
|-------------------|---------------|--------|
| **Id**            | Auto (default)| Primary key. |
| **Message_Id**    | SingleLineText | **Unique.** Wooztell message/event id. |
| **Conversation_Id** | SingleLineText | Same value as in `WhatsApp_Conversations.Conversation_Id`. Used to filter “messages for this chat”. |
| **Text**          | LongText      | Message body (empty for non-text types). |
| **From_Me**       | Checkbox      | true = sent by bot/agent, false = from customer. |
| **Created_Time**  | SingleLineText or Number | Wooztell timestamp (string or epoch ms). For ordering and date dividers. |
| **Synced_At**     | DateTime      | When we last saw this message from API. Optional. |

- **Unique:** `Message_Id`.
- **Suggested table name:** `WhatsApp_Messages` (or set `NOCODB_WHATSAPP_MESSAGES_TABLE_ID` to the table ID after creation).

Optional: add a **Link to another record** field linking **Conversation** → `WhatsApp_Conversations` (by matching `Conversation_Id`) for easier browsing in NocoDB UI. The app can work with `Conversation_Id` only.

---

## 3. Table: **WhatsApp_SyncState** (for incremental sync)

Stores the last Wooztell cursor and sync time so incremental sync can fetch only new events.

| Column title    | NocoDB type   | Notes |
|-----------------|---------------|--------|
| **Id**          | Auto (default)| Primary key. |
| **Sync_Key**    | SingleLineText | **Unique.** Use `default` (one row). |
| **Last_Cursor** | LongText      | Wooztell `conversationHistory` pageInfo.endCursor. |
| **Last_Synced_At** | DateTime   | When we last ran sync. |

- **Suggested table name:** `WhatsApp_SyncState` (or set `NOCODB_WHATSAPP_SYNC_STATE_TABLE_ID`).

---

## 4. Steps in NocoDB

1. In your base, click **+ Add Table**.
2. Create **WhatsApp_Conversations**:
   - Add columns as in the table above.
   - Set **Conversation_Id** as **Unique** (if your NocoDB version supports it).
3. Create **WhatsApp_Messages**:
   - Add columns as above.
   - Set **Message_Id** as **Unique**.
   - (Optional) Add a **Link to another record** → `WhatsApp_Conversations` for UI.
4. Create **WhatsApp_SyncState** with columns above (Sync_Key, Last_Cursor, Last_Synced_At). Add one row with Sync_Key = `default` (optional; sync will create it).
5. Copy the **table IDs** from the table URLs (e.g. `m1abc...`) or use the table names.

---

## 5. Environment variables

After the tables exist, add to `.env.local`:

```env
# WhatsApp Inbox cache (NocoDB). Same base as NOCODB_BASE_URL.
NOCODB_BASE_URL=https://your-app.nocodb.com
# Use either NOCODB_API_TOKEN or NOCODB_XC_TOKEN (NocoDB sends as xc-token header).
NOCODB_API_TOKEN=your-token
# Or: NOCODB_XC_TOKEN=your-token

# Table IDs or table names. NOCODB_BASE_ID required for NocoDB v1 API fallback.
NOCODB_BASE_ID=p...
NOCODB_WHATSAPP_CONVERSATIONS_TABLE_ID=WhatsApp_Conversations
NOCODB_WHATSAPP_MESSAGES_TABLE_ID=WhatsApp_Messages
NOCODB_WHATSAPP_SYNC_STATE_TABLE_ID=WhatsApp_SyncState
```

Use the actual **table IDs** (e.g. `mn010qeqmsne1om`) from table settings — not view IDs (`vw...` from the browser URL when viewing a grid). If you paste a view ID by mistake, the app can auto-resolve it when `NOCODB_BASE_ID` is set.

---

## 6. How the app uses them

- **Conversations list:** Read from `WhatsApp_Conversations`, order by `Updated_Time` desc. If a conversation is missing or stale, fetch from Wooztell and upsert.
- **Messages for a chat:** Read from `WhatsApp_Messages` where `Conversation_Id` = current chat, order by `Created_Time` asc. If new messages might exist, fetch from Wooztell and insert new rows.
- **Sync:** Periodically (or on demand) pull from Wooztell and upsert conversations; for each conversation fetch messages and insert any new `Message_Id`s.

This keeps NocoDB as the cache and reduces repeated Wooztell API calls.

---

## 7. How to run init sync

1. Ensure **NOCODB_BASE_URL**, **NOCODB_API_TOKEN** (or **NOCODB_XC_TOKEN**), **NOCODB_WHATSAPP_CONVERSATIONS_TABLE_ID**, **NOCODB_WHATSAPP_MESSAGES_TABLE_ID**, and **NOCODB_WHATSAPP_SYNC_STATE_TABLE_ID** are set. Set **NOCODB_BASE_ID** if you use NocoDB v1 API. Wooztell env vars (**WOOZTELL_API_BASE_URL**, **WOOZTELL_API_TOKEN**) must be set for sync.
2. Create the three NocoDB tables (Conversations, Messages, SyncState) as above.
3. Call the init endpoint once to backfill:

   ```bash
   curl -X POST http://localhost:3000/api/whatsapp/sync/init
   ```

   If you set **ADMIN_SYNC_SECRET**, add the header:

   ```bash
   curl -X POST http://localhost:3000/api/whatsapp/sync/init \
     -H "x-sync-secret: YOUR_ADMIN_SYNC_SECRET"
   ```

   Init paginates Wooztell `conversationHistory(first=500, after=cursor)` until done, with a safety cap of 20 pages (10,000 events). It upserts into NocoDB and saves the last cursor in SyncState.

4. For ongoing updates, call incremental periodically or from a cron:

   ```bash
   curl -X POST http://localhost:3000/api/whatsapp/sync/incremental
   ```

   With admin secret: `curl -X POST ... -H "x-sync-secret: YOUR_ADMIN_SYNC_SECRET"`.

5. The inbox UI at `/dashboard/whatsapp-inbox` reads from NocoDB when these table env vars are set; otherwise it falls back to Wooztell.
