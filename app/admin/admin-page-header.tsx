import Link from "next/link";

interface AdminPageHeaderProps {
  title: string;
  subtitle: string;
  accent?: "indigo" | "amber";
}

const accentStyles = {
  indigo: {
    section:
      "border-indigo-200/80 bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-600 shadow-indigo-200/40",
    subtitle: "text-indigo-100",
    backButton: "border-red-400 bg-red-600 text-white hover:bg-red-700",
  },
  amber: {
    section:
      "border-amber-200/80 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-500 shadow-amber-200/40",
    subtitle: "text-amber-50",
    backButton: "border-red-400 bg-red-600 text-white hover:bg-red-700",
  },
};

export function AdminPageHeader({
  title,
  subtitle,
  accent = "indigo",
}: AdminPageHeaderProps) {
  const styles = accentStyles[accent];

  return (
    <header
      className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-6 py-5 shadow-lg ${styles.section}`}
    >
      <div>
        <h1 className="text-4xl font-semibold text-white">{title}</h1>
        <p className={`mt-2 text-lg ${styles.subtitle}`}>{subtitle}</p>
      </div>
      <Link
        href="/admin"
        className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${styles.backButton}`}
      >
        Back to Admin Portal
      </Link>
    </header>
  );
}
