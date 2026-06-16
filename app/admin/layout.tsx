import { logoutAction } from "@/app/login/actions";
import { PortalLogo } from "@/components/portal-logo";
import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50/90 to-violet-100/80">
      <header className="sticky top-0 z-10 border-b border-indigo-900/20 bg-gradient-to-r from-indigo-800 via-indigo-700 to-violet-700 shadow-md shadow-indigo-900/10">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center justify-between gap-4 pl-2 pr-4 sm:px-6">
          <nav className="flex items-center gap-3">
            <PortalLogo href="/admin" size={40} className="rounded-lg bg-white/10 p-0.5" />
            <Link href="/admin" className="text-[1.75rem] font-semibold leading-tight text-white">
              Admin Portal
            </Link>
          </nav>
          <div className="ml-4 flex shrink-0 items-center gap-3">
            <span className="text-[1.3125rem] font-bold text-white">
              Welcome Admin
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-red-400 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
