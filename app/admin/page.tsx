import { AdminQuickLinks } from "./admin-quick-links";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-600 px-6 py-6 shadow-lg shadow-indigo-200/40">
        <h1 className="text-4xl font-semibold text-white">Admin Portal</h1>
        <p className="mt-2 text-lg text-indigo-100">
          You are signed in as an administrator.
        </p>
      </header>
      <AdminQuickLinks />
    </div>
  );
}
