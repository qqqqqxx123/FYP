import Link from "next/link";

function ScamReportIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

const quickLinkCardClass =
  "flex h-[18.72rem] w-[18.72rem] flex-col items-center justify-center gap-4 rounded-xl border text-slate-800 shadow-md transition-colors";

const quickLinkIconClass = "h-[11.7rem] w-[11.7rem]";

export function AdminQuickLinks() {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-white/90 p-8 shadow-lg shadow-indigo-100/50 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-indigo-900">Quick links</h2>
      <div className="mt-8 flex flex-wrap items-center justify-start gap-8">
        <Link
          href="/admin/users"
          className={`${quickLinkCardClass} border-indigo-200 bg-gradient-to-b from-indigo-50 to-white hover:border-indigo-300 hover:from-indigo-100 hover:shadow-indigo-100/60`}
        >
          <UsersIcon className={`${quickLinkIconClass} text-indigo-600`} />
          <span className="text-center text-base font-medium leading-tight">
            User Manage
          </span>
        </Link>
        <Link
          href="/admin/scam-reports"
          className={`${quickLinkCardClass} border-amber-200 bg-gradient-to-b from-amber-50 to-white hover:border-amber-300 hover:from-amber-100 hover:shadow-amber-100/60`}
        >
          <ScamReportIcon className={`${quickLinkIconClass} text-amber-600`} />
          <span className="text-center text-base font-medium leading-tight">
            User Scam Report
          </span>
        </Link>
      </div>
    </div>
  );
}
