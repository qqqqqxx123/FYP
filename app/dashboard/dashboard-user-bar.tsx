import { logoutAction } from "@/app/login/actions";

interface DashboardUserBarProps {
  username: string;
}

export function DashboardUserBar({ username }: DashboardUserBarProps) {
  return (
    <div className="ml-4 flex shrink-0 items-center gap-3">
      <span className="max-w-[10rem] truncate text-sm font-medium text-emerald-50 sm:max-w-[14rem]">
        {username}
      </span>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-lg border border-white/35 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Logout
        </button>
      </form>
    </div>
  );
}
