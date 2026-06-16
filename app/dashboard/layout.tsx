import { DashboardBackground } from "@/components/dashboard-background";
import { cookies } from "next/headers";
import { getUsernameFromSession } from "@/lib/session";
import { DashboardHeader } from "./dashboard-header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = (await cookies()).get("crm-session")?.value;
  const username = getUsernameFromSession(session);

  return (
    <div className="relative min-h-screen">
      <DashboardBackground />
      <DashboardHeader username={username} />
      <main className="relative w-full px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
