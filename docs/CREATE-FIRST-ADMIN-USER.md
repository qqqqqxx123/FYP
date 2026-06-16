# Create the first admin user in NocoDB

## 1. Encoded password for `admin123`

Use this **bcrypt hash** in the **Password** column of your NocoDB **Users** table (never store plain `admin123`):

```
$2a$10$iLBZKD6kjDOXGG5X5hbDX.3ZudbIagz6//MVXX3AaYJbwu1anOLie
```

To generate a different password hash later, run:

```bash
node scripts/hash-password.js
# or for another password:
node scripts/hash-password.js "yourNewPassword"
```

## 2. Add the admin row in NocoDB

In your **Users** table, add a new record with:

| Column         | Value |
|----------------|--------|
| **Username**   | `admin` |
| **Password**   | `$2a$10$iLBZKD6kjDOXGG5X5hbDX.3ZudbIagz6//MVXX3AaYJbwu1anOLie` |
| **Display name** | `Admin` (or any name) |
| **role**       | `admin` |
| **Is Active**  | ✓ (checked) |
| **Last Login At** | leave empty |

Save the row.

## 3. Sign in from the CRM app

- Open your app’s login page.
- **Username:** `admin`
- **Password:** `admin123`

Login is validated against this Users table: the app looks up the user by **Username** and checks the submitted password against the stored **Password** (bcrypt) hash.
