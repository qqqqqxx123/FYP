import { AdminPageHeader } from "@/app/admin/admin-page-header";
import {
  listUsersFromNocoDB,
  listWhatsAppConnectionSummariesByUserId,
  type AdminUserTableItem,
} from "@/lib/nocodb";
import { normalizeWhatsAppUserIdPart } from "@/lib/whatsapp-session-id";
import { AdminUsersTable } from "./admin-users-table";

export default async function AdminUsersPage() {
  let users: AdminUserTableItem[] = [];
  let error: string | null = null;

  try {
    const [allUsers, whatsappByUserId] = await Promise.all([
      listUsersFromNocoDB(),
      listWhatsAppConnectionSummariesByUserId(),
    ]);

    users = allUsers
      .filter((user) => user.admin.trim().toUpperCase() !== "Y")
      .map((user) => {
        const userKey = normalizeWhatsAppUserIdPart(user.id);
        const whatsapp = whatsappByUserId[userKey] ?? {
          connectedCount: 0,
          connectedPhones: [],
        };

        return {
          ...user,
          whatsappConnectedCount: whatsapp.connectedCount,
          whatsappConnectedPhones: whatsapp.connectedPhones,
        };
      });
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load users";
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="User Manage"
        subtitle="All users from the Users table"
        accent="indigo"
      />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : users.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
          No users found in the Users table.
        </p>
      ) : (
        <AdminUsersTable users={users} />
      )}
    </div>
  );
}
