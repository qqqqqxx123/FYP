import { AdminPageHeader } from "@/app/admin/admin-page-header";
import { listScamReportsFromNocoDB } from "@/lib/nocodb-scam-report";
import { AdminScamReportsTable } from "./admin-scam-reports-table";

export default async function AdminScamReportsPage() {
  let reports: Awaited<ReturnType<typeof listScamReportsFromNocoDB>> = [];
  let error: string | null = null;

  try {
    reports = await listScamReportsFromNocoDB();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load scam reports";
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="User Scam Report"
        subtitle="All scam reports submitted by users"
        accent="indigo"
      />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : reports.length === 0 ? (
        <p className="rounded-xl border border-indigo-100 bg-white px-6 py-8 text-center text-[1.3125rem] text-slate-600">
          No scam reports found.
        </p>
      ) : (
        <AdminScamReportsTable reports={reports} />
      )}
    </div>
  );
}
