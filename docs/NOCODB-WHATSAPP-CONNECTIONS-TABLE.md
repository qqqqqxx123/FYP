# NocoDB Table: WhatsApp Connections

Create a table in your NocoDB base to store the **two WhatsApp numbers** connected to the CRM (via wa-bridge or Baileys).

## 1. Create the table

1. In your NocoDB base, click **+ Add Table**.
2. Name the table **WhatsApp_Connections** (or set `NOCODB_WHATSAPP_CONNECTIONS_TABLE_ID` to the table ID after creation).
3. Add the following columns:

| Column title   | Type          | Notes                                      |
|----------------|---------------|--------------------------------------------|
| **Slot**       | Number        | 1 or 2 (only two slots allowed).           |
| **Phone_Number** | SingleLineText | e.g. `+85291231234`. Empty when disconnected. |
| **Status**    | SingleLineText | `connected` or `disconnected`.            |
| **Updated_At** | DateTime     | Optional. Last updated.                    |

4. Ensure **Slot** is unique per row (you can add a unique constraint or just keep only two rows: one with Slot 1, one with Slot 2).

## 2. Environment variable

In `.env.local`:

```env
# Optional. Table name or table ID (m...) for WhatsApp connections. Default: "WhatsApp_Connections"
NOCODB_WHATSAPP_CONNECTIONS_TABLE_ID=WhatsApp_Connections
```

If you use the table ID from the NocoDB URL, set it here instead of the name.

## 3. How the CRM uses it

- **On load:** The WhatsApp Connect page reads this table and shows the two slots with their stored phone numbers (if any).
- **On connect:** When a user scans the QR and a number connects, the CRM saves that slot’s phone and status to this table.
- **On disconnect:** The CRM clears (or sets status disconnected) for that slot in this table.

Only two numbers are stored (Slot 1 and Slot 2).
