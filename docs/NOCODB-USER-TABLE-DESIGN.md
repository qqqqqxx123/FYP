# NocoDB User Table Design for Montresor Infni CRM

This guide suggests how to design your **user/CRM tables** in NocoDB so they work with the Montresor Infni CRM login and future Wooztell integration.

---

## 1. How login works with NocoDB

- **Login** uses NocoDB’s built-in auth: **Email + Password** via `/api/v1/auth/user/signin`.
- NocoDB manages its own **internal users** (who can sign in). You do **not** store passwords in your CRM tables.
- Your CRM tables store **extra profile and CRM data** and link to NocoDB users (e.g. by **email** or by a **User** field if you use NocoDB’s base-level users).

So you need:
1. **NocoDB base users** (for sign-in) – created in NocoDB Account / Workspace.
2. **CRM profile/team table(s)** – your data in a base, linked to those users.

---

## 2. Suggested table: **CRM Team Members** (user profiles)

Use one main table to hold CRM-specific user/profile data. NocoDB’s internal users handle login; this table holds roles, display names, and Wooztell linkage.

| Field name       | NocoDB field type | Notes |
|------------------|-------------------|--------|
| **Email**        | SingleLineText    | Unique. Same as NocoDB login email. Used to link “who signed in” to this row. |
| **Full Name**    | SingleLineText    | Display name in the CRM. |
| **Role**         | SingleSelect      | Values: `Admin`, `Manager`, `Agent`, `Viewer`. |
| **Phone**        | Phone or SingleLineText | For Wooztell / WhatsApp linking. |
| **Wooztell Member Id** | SingleLineText | Optional. Wooztell member/channel id for linking conversations. |
| **Avatar**       | Attachment        | Optional. Profile image URL or file. |
| **Is Active**    | Checkbox          | Default: true. Soft disable access. |
| **Last Login At**| DateTime          | Optional. Update via API or automation when user signs in. |
| **Created At**   | DateTime          | Auto or formula. |
| **Updated At**   | DateTime          | Auto or formula. |

- **Primary key**: Id (auto).
- **Unique constraint** on **Email** (if your NocoDB version supports it), so one row per user.

After login in your app, you get the user’s **email** (and optionally id) from NocoDB’s `/api/v1/auth/user/me`. Use that **email** to look up the corresponding row in **CRM Team Members** to get role, name, Wooztell Member Id, etc.

---

## 3. Optional: **CRM Users** (minimal)

If you prefer a shorter table name and fewer fields at first:

| Field name   | NocoDB field type | Notes |
|--------------|-------------------|--------|
| **Email**    | SingleLineText    | Unique. Match NocoDB login. |
| **Display Name** | SingleLineText | Show in app. |
| **Role**     | SingleSelect      | e.g. Admin, Agent, Viewer. |
| **Wooztell Member Id** | SingleLineText | For Wooztell integration. |
| **Is Active**| Checkbox          | Default true. |

Same idea: link by **email** after NocoDB sign-in.

---

## 4. NocoDB “User” field type (for assignees, not login)

- NocoDB has a **User** field type for **assigning base users** to records (e.g. “Assigned to” on deals or tasks).
- That’s for **who is responsible** for a record, not for “who can log in.” Login is still NocoDB’s built-in auth.
- You can use **User** on other tables (Deals, Tasks, Contacts) to link to NocoDB users; your **CRM Team Members** table is the place for extra CRM profile data and Wooztell ids.

---

## 5. Steps in NocoDB (summary)

1. Create a **Base** (e.g. “Montresor Infni CRM”).
2. Add table **CRM Team Members** (or **CRM Users**) with the fields above.
3. Set **Email** as unique (if available).
4. Invite team members in NocoDB (Account/Workspace) so they can sign in with email/password.
5. For each invited user, add one row in **CRM Team Members** with the same **Email**, plus **Full Name**, **Role**, and optionally **Phone** and **Wooztell Member Id**.

Your login page already uses NocoDB’s sign-in API; after login, use the returned user’s email to load the matching **CRM Team Members** row for role and Wooztell data.

---

## 6. Wooztell integration (later)

- **Wooztell Member Id** (and **Phone**) in **CRM Team Members** will be used to link NocoDB records to Wooztell conversations.
- When you add Contacts/Leads tables, you can add a **Wooztell Member Id** or **Phone** there too and sync with Wooztell via their Open API.

If you want, next step can be: **dashboard after login** and **reading CRM Team Members by email** from your Next.js app.
