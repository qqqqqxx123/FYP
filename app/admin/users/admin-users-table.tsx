"use client";

import type { AdminUserTableItem, UserLoginStatus } from "@/lib/nocodb";
import { formatWhatsAppPhoneDisplay } from "@/lib/whatsapp-phone";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { removeUserAction, updateUserAction } from "./actions";

interface AdminUsersTableProps {
  users: AdminUserTableItem[];
}

const tableTextClass = "text-[1.3125rem] leading-snug";
const tableCellClass = "px-6 py-4";
const actionButtonClass =
  "rounded-lg border px-[1.125rem] py-[0.5625rem] text-[1.125rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
const iconActionClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50";

function EditIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function DeleteIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

const loginStatusConfig: Record<
  UserLoginStatus,
  { label: string; className: string }
> = {
  online: {
    label: "Online",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  offline: {
    label: "Offline",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  never: {
    label: "Never online",
    className: "border-slate-200 bg-slate-100 text-slate-600",
  },
};

function UserLoginStatusBadge({ status }: { status: UserLoginStatus }) {
  const config = loginStatusConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[1.125rem] font-medium ${config.className}`}
    >
      <span
        className={`h-3 w-3 rounded-full ${
          status === "online"
            ? "bg-emerald-500"
            : status === "offline"
              ? "bg-red-500"
              : "bg-slate-400"
        }`}
        aria-hidden
      />
      {config.label}
    </span>
  );
}

function matchesUserSearch(user: AdminUserTableItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    user.id,
    user.username,
    user.email,
    user.displayName,
    user.createdAt,
    user.lastLoginAt,
    loginStatusConfig[user.loginStatus].label,
    String(user.whatsappConnectedCount),
    ...user.whatsappConnectedPhones.map((phone) => formatWhatsAppPhoneDisplay(phone)),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function WhatsAppConnectionsCell({
  count,
  phones,
}: {
  count: number;
  phones: string[];
}) {
  if (count === 0) {
    return <span className="text-slate-500">—</span>;
  }

  if (phones.length === 0) {
    return (
      <span className="inline-flex items-center gap-2 font-medium text-emerald-700">
        <span className="h-3 w-3 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        {count} connected
      </span>
    );
  }

  return (
    <div className="space-y-1">
      {phones.map((phone) => (
        <p key={phone} className="inline-flex items-center gap-2 font-medium text-slate-800">
          <span className="h-3 w-3 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          {formatWhatsAppPhoneDisplay(phone)}
        </p>
      ))}
    </div>
  );
}

export function AdminUsersTable({ users }: AdminUsersTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUserTableItem | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editConfirmPassword, setEditConfirmPassword] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredUsers = useMemo(
    () => users.filter((user) => matchesUserSearch(user, search)),
    [users, search]
  );

  const selectedUsers = useMemo(
    () => filteredUsers.filter((user) => user.id && selectedIds.has(user.id)),
    [filteredUsers, selectedIds]
  );

  function toggleUserSelection(userId: string, checked: boolean) {
    if (!userId) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  function openEditDialog(user: AdminUserTableItem) {
    setActionError(null);
    setEditingUser(user);
    setEditUsername(user.username);
    setEditPassword("");
    setEditConfirmPassword("");
  }

  function closeEditDialog() {
    if (isPending) return;
    setEditingUser(null);
    setEditUsername("");
    setEditPassword("");
    setEditConfirmPassword("");
  }

  function handleUpdate() {
    if (!editingUser) return;

    if (editPassword && editPassword !== editConfirmPassword) {
      setActionError("Passwords do not match");
      return;
    }

    startTransition(async () => {
      try {
        setActionError(null);
        await updateUserAction(
          editingUser.id,
          editUsername,
          editPassword,
          editConfirmPassword
        );
        closeEditDialog();
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to update user");
      }
    });
  }

  function handleRemoveSelected() {
    if (selectedUsers.length === 0) return;

    const label =
      selectedUsers.length === 1
        ? selectedUsers[0].username || selectedUsers[0].id
        : `${selectedUsers.length} users`;
    if (
      !window.confirm(
        selectedUsers.length === 1
          ? `Remove user "${label}"? This cannot be undone.`
          : `Remove ${selectedUsers.length} selected users? This cannot be undone.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        setActionError(null);
        for (const user of selectedUsers) {
          await removeUserAction(user.id);
        }
        setSelectedIds(new Set());
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to remove user");
      }
    });
  }

  return (
    <>
      {actionError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}

      <div className="rounded-2xl border border-indigo-100 bg-white/95 p-4 shadow-lg shadow-indigo-100/40 backdrop-blur-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="sr-only" htmlFor="admin-users-search">
          Search users
        </label>
        <input
          id="admin-users-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, username, or email…"
          className={`w-full rounded-xl border border-indigo-200 bg-indigo-50/40 px-6 py-3.5 text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200 sm:max-w-xl ${tableTextClass}`}
        />
        <p className={`shrink-0 font-medium text-indigo-700 ${tableTextClass}`}>
          {filteredUsers.length} of {users.length} users
        </p>
      </div>

      {selectedUsers.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-5 py-3 shadow-sm">
          <p className={`font-medium text-indigo-800 ${tableTextClass}`}>
            {selectedUsers.length} selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => selectedUsers.length === 1 && openEditDialog(selectedUsers[0])}
              disabled={isPending || selectedUsers.length !== 1}
              aria-label="Update selected user"
              title={selectedUsers.length === 1 ? "Update" : "Select one user to update"}
              className={`${iconActionClass} border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 disabled:opacity-40`}
            >
              <EditIcon />
            </button>
            <button
              type="button"
              onClick={handleRemoveSelected}
              disabled={isPending}
              aria-label="Delete selected user(s)"
              title="Delete"
              className={`${iconActionClass} border-red-200 bg-white text-red-700 hover:bg-red-100`}
            >
              <DeleteIcon />
            </button>
          </div>
        </div>
      ) : null}

      {filteredUsers.length === 0 ? (
        <p className={`mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 px-6 py-8 text-center text-slate-600 ${tableTextClass}`}>
          No users match your search.
        </p>
      ) : (
      <div className="mt-4 overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className={`w-full min-w-[58rem] divide-y divide-indigo-100 text-left ${tableTextClass}`}>
            <thead className="bg-gradient-to-r from-indigo-600 to-violet-600">
              <tr>
                <th className={`${tableCellClass} font-semibold text-white`}>Select</th>
                <th className={`${tableCellClass} font-semibold text-white`}>User ID</th>
                <th className={`${tableCellClass} font-semibold text-white`}>Username</th>
                <th className={`${tableCellClass} font-semibold text-white`}>Connected WhatsApp</th>
                <th className={`${tableCellClass} font-semibold text-white`}>Created At</th>
                <th className={`${tableCellClass} font-semibold text-white`}>Last Login At</th>
                <th className={`${tableCellClass} font-semibold text-white`}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-50">
              {filteredUsers.map((user) => {
                const isSelected = Boolean(user.id && selectedIds.has(user.id));
                return (
                <tr
                  key={user.id || user.username || user.email}
                  className={`even:bg-indigo-50/30 hover:bg-indigo-50/60 ${
                    isSelected ? "bg-indigo-100/70 ring-1 ring-inset ring-indigo-200" : ""
                  }`}
                >
                  <td className={`${tableCellClass} text-slate-700`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => toggleUserSelection(user.id, e.target.checked)}
                      aria-label={`Select user ${user.username || user.id || "unknown"}`}
                      className="h-6 w-6 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className={`${tableCellClass} text-slate-900`}>{user.id || "—"}</td>
                  <td className={`${tableCellClass} text-slate-900`}>{user.username || "—"}</td>
                  <td className={`${tableCellClass} text-slate-700`}>
                    <WhatsAppConnectionsCell
                      count={user.whatsappConnectedCount}
                      phones={user.whatsappConnectedPhones}
                    />
                  </td>
                  <td className={`${tableCellClass} text-slate-700`}>{user.createdAt || "—"}</td>
                  <td className={`${tableCellClass} text-slate-700`}>{user.lastLoginAt || "—"}</td>
                  <td className={tableCellClass}>
                    <UserLoginStatusBadge status={user.loginStatus} />
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
      </div>

      {editingUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h2 id="edit-user-title" className="text-lg font-semibold text-slate-900">
              Update user
            </h2>
            <p className="mt-1 text-sm text-slate-600">User ID: {editingUser.id}</p>

            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="edit-username">
              Username
            </label>
            <input
              id="edit-username"
              type="text"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />

            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="edit-password">
              New password
            </label>
            <input
              id="edit-password"
              type="password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />

            {editPassword ? (
              <>
                <label
                  className="mt-4 block text-sm font-medium text-slate-700"
                  htmlFor="edit-confirm-password"
                >
                  Confirm new password
                </label>
                <input
                  id="edit-confirm-password"
                  type="password"
                  value={editConfirmPassword}
                  onChange={(e) => setEditConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditDialog}
                disabled={isPending}
                className={`${actionButtonClass} border-slate-200 text-slate-700 hover:bg-slate-50`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                disabled={
                  isPending ||
                  !editUsername.trim() ||
                  (editPassword.length > 0 && !editConfirmPassword.trim())
                }
                className={`${actionButtonClass} border-indigo-200 bg-indigo-600 text-white hover:bg-indigo-700`}
              >
                {isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
