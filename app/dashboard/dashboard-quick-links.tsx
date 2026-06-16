import Link from "next/link";
import type { ReactNode } from "react";
import { SecurityNewsSection } from "./security-news-section";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ReportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function StartArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

interface QuickLinkConfig {
  href: string;
  title: string;
  description: string;
  buttonLabel: string;
  sideLabel: string;
  panelClass: string;
  buttonClass: string;
  accentBarClass: string;
  icon: ReactNode;
}

const quickLinks: QuickLinkConfig[] = [
  {
    href: "/dashboard/whatsapp-connect",
    title: "WhatsApp Connect",
    description:
      "Scan a QR code to link your WhatsApp account. Once connected, the AI agent can monitor messages and flag potential scams in real time.",
    buttonLabel: "Connect now",
    sideLabel: "CONNECT",
    panelClass:
      "bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600",
    buttonClass: "bg-emerald-800 hover:bg-emerald-900",
    accentBarClass: "bg-emerald-800",
    icon: <WhatsAppIcon className="h-24 w-24 text-white/90 sm:h-28 sm:w-28" />,
  },
  {
    href: "/dashboard/whatsapp-templates",
    title: "Report Scam",
    description:
      "Submit a scam case with photos, contact details, and incident information. Help protect the community by sharing what you encountered.",
    buttonLabel: "Report a scam",
    sideLabel: "REPORT",
    panelClass:
      "bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600",
    buttonClass: "bg-violet-900 hover:bg-violet-950",
    accentBarClass: "bg-violet-900",
    icon: <ReportIcon className="h-24 w-24 text-white/90 sm:h-28 sm:w-28" />,
  },
  {
    href: "/dashboard/whatsapp-inbox",
    title: "View WhatsApp",
    description:
      "Open your WhatsApp inbox to read conversations, review scam-risk scores on messages, and see alerts from the AI Scam detect Agent.",
    buttonLabel: "Open inbox",
    sideLabel: "INBOX",
    panelClass: "bg-gradient-to-br from-cyan-600 via-teal-600 to-emerald-700",
    buttonClass: "bg-teal-900 hover:bg-teal-950",
    accentBarClass: "bg-teal-900",
    icon: <InboxIcon className="h-24 w-24 text-white/90 sm:h-28 sm:w-28" />,
  },
];

function QuickLinkBanner({ item }: { item: QuickLinkConfig }) {
  return (
    <article className="group flex min-h-[11rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-slate-900/5 transition hover:shadow-xl sm:min-h-[10.5rem] sm:flex-row">
      <div
        className={`relative flex min-h-[10rem] w-full shrink-0 items-center justify-center overflow-hidden sm:min-h-0 sm:w-52 lg:w-60 ${item.panelClass}`}
      >
        <span
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 select-none text-[2.75rem] font-black uppercase tracking-[0.2em] text-white/20 [writing-mode:vertical-rl] sm:left-3 sm:text-4xl"
          aria-hidden
        >
          {item.sideLabel}
        </span>
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.45) 0%, transparent 45%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.2) 0%, transparent 50%)",
          }}
          aria-hidden
        />
        <div className="relative drop-shadow-lg transition-transform duration-300 group-hover:scale-105">
          {item.icon}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-5 p-6 sm:p-8">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem]">
            {item.title}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-[0.95rem]">
            {item.description}
          </p>
        </div>
        <Link
          href={item.href}
          className={`inline-flex w-fit items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-white shadow-md transition ${item.buttonClass}`}
        >
          {item.buttonLabel}
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
            <StartArrowIcon className="h-3.5 w-3.5" />
          </span>
        </Link>
      </div>

      <div className={`hidden w-2.5 shrink-0 sm:block ${item.accentBarClass}`} aria-hidden />
    </article>
  );
}

export async function DashboardQuickLinks() {
  return (
    <div className="w-full space-y-6">
      <h2 className="text-center text-lg font-semibold uppercase tracking-[0.2em] text-amber-900/80">
        Quick links
      </h2>
      <div className="flex flex-col gap-6">
        {quickLinks.slice(0, 2).map((item) => (
          <QuickLinkBanner key={item.href} item={item} />
        ))}
        <QuickLinkBanner item={quickLinks[2]} />
        <SecurityNewsSection />
      </div>
    </div>
  );
}
