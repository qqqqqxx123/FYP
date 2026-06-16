import Image from "next/image";
import type { ReactNode } from "react";

interface DashboardPageBannerProps {
  title: string;
  subtitle: string;
  meta?: ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  compact?: boolean;
  /** Compact header on green geometric banner (e.g. WhatsApp Inbox). */
  tone?: "light" | "emerald";
  className?: string;
}

function DotGrid({ className }: { className?: string }) {
  return (
    <div
      className={`grid grid-cols-4 gap-[0.35rem] ${className ?? ""}`}
      aria-hidden
    >
      {Array.from({ length: 16 }).map((_, index) => (
        <span key={index} className="h-[0.35rem] w-[0.35rem] rounded-full bg-[#F38118]" />
      ))}
    </div>
  );
}

const geometricGridStyle = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,0.85) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.85) 1px, transparent 1px)",
  backgroundSize: "14px 14px",
} as const;

const stripedCircleStyle = {
  backgroundImage:
    "repeating-linear-gradient(45deg, #1b3a36 0, #1b3a36 1px, transparent 1px, transparent 4px)",
} as const;

function GeometricBannerWing({ mirror = false }: { mirror?: boolean }) {
  return (
    <div
      className={`relative hidden w-20 shrink-0 overflow-hidden bg-[#fff3e0] sm:block sm:w-28 lg:w-36 xl:w-44 ${
        mirror ? "[transform:scaleX(-1)]" : ""
      }`}
      aria-hidden
    >
      <div className="absolute inset-0 opacity-50" style={geometricGridStyle} />
      <div className="absolute -left-4 top-1 h-12 w-12 rounded-full border-2 border-[#ffab91] bg-[#ffccbc]/75" />
      <div className="absolute left-8 top-8 h-4 w-4 rounded-full bg-[#F38118]/90" />
      <div className="absolute bottom-4 left-3 h-6 w-6 rounded-full bg-[#b71c1c]/85" />
      <div className="absolute left-10 top-14 h-7 w-7 rounded-full border-2 border-[#1b3a36]">
        <div className="h-full w-full rounded-full" style={stripedCircleStyle} />
      </div>
      <div className="absolute left-4 top-[3.25rem] h-5 w-5 rounded-full border-2 border-[#F38118]/80 bg-transparent" />
      <svg
        className="absolute bottom-0 left-0 h-16 w-16 text-[#1b3a36]"
        viewBox="0 0 56 56"
        fill="none"
        aria-hidden
      >
        <path
          d="M4 44 C18 8, 34 8, 48 44"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <svg
        className="absolute right-1 top-2 h-10 w-10 text-[#1b3a36]/80"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden
      >
        <path
          d="M6 30 C14 10, 26 10, 34 30"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute bottom-10 right-3 h-3 w-3 rotate-45 border-2 border-[#ffab91] bg-[#ffccbc]/60" />
      <div className="absolute right-4 top-12 h-2 w-10 rounded-full bg-white/90" />
      <div className="absolute right-5 top-[3.6rem] flex flex-col gap-1">
        <span className="h-0.5 w-8 rounded-full bg-white/85" />
        <span className="h-0.5 w-5 rounded-full bg-white/75" />
        <span className="h-0.5 w-7 rounded-full bg-white/85" />
        <span className="h-0.5 w-4 rounded-full bg-white/70" />
      </div>
      <div className="absolute bottom-2 right-6 flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[#F38118]/80" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#1b3a36]/70" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#b71c1c]/75" />
      </div>
    </div>
  );
}

function GeometricBannerCenterDecor({ mirror = false }: { mirror?: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 hidden w-[32%] max-w-[10rem] sm:block lg:max-w-[12rem] ${
        mirror ? "right-0 [transform:scaleX(-1)]" : "left-0"
      }`}
      aria-hidden
    >
      <div className="absolute inset-0 opacity-35" style={geometricGridStyle} />
      <div className="absolute left-2 top-2 h-9 w-9 rounded-full border-2 border-[#ffab91]/90 bg-[#ffccbc]/55" />
      <div className="absolute left-10 top-6 h-3 w-3 rounded-full bg-[#b71c1c]/80" />
      <div className="absolute bottom-3 left-4 h-5 w-5 rounded-full border-2 border-[#F38118]/75" />
      <div className="absolute bottom-7 left-12 h-6 w-6 rounded-full border-2 border-[#1b3a36]">
        <div className="h-full w-full rounded-full" style={stripedCircleStyle} />
      </div>
      <svg
        className="absolute bottom-0 left-1 h-12 w-20 text-[#1b3a36]/90"
        viewBox="0 0 80 48"
        fill="none"
        aria-hidden
      >
        <path
          d="M4 40 C22 6, 42 6, 60 40"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute right-4 top-4 flex flex-col gap-1.5">
        <span className="h-0.5 w-10 rounded-full bg-white/90" />
        <span className="h-0.5 w-6 rounded-full bg-white/80" />
        <span className="h-0.5 w-8 rounded-full bg-white/85" />
      </div>
      <div className="absolute right-6 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#F38118]/85" />
      <div className="absolute right-2 bottom-4 h-4 w-4 rotate-12 rounded-sm border border-[#1b3a36]/50 bg-white/40" />
    </div>
  );
}

function EmeraldGeometricBanner({
  title,
  subtitle,
  meta,
  className,
}: {
  title: string;
  subtitle: string;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`relative overflow-hidden rounded-2xl border border-orange-200/50 bg-[#fff3e0]/80 shadow-lg shadow-slate-900/10 backdrop-blur-sm ${className ?? ""}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-25" style={geometricGridStyle} aria-hidden />
      <div className="pointer-events-none absolute left-3 top-2 h-7 w-7 rounded-full border-2 border-[#ffab91] bg-[#ffccbc]/55 sm:hidden" aria-hidden />
      <div className="pointer-events-none absolute bottom-2 right-3 h-5 w-5 rounded-full bg-[#b71c1c]/80 sm:hidden" aria-hidden />
      <div className="pointer-events-none absolute right-4 top-3 h-4 w-4 rounded-full border-2 border-[#1b3a36] sm:hidden" aria-hidden />
      <div className="flex items-stretch">
        <GeometricBannerWing />
        <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-5 py-4 text-center">
          <GeometricBannerCenterDecor />
          <GeometricBannerCenterDecor mirror />
          <div className="pointer-events-none absolute left-1/2 top-3 h-2 w-2 -translate-x-6 rounded-full bg-[#ffccbc]/80" aria-hidden />
          <div className="pointer-events-none absolute bottom-3 left-1/2 h-2 w-2 translate-x-4 rounded-full bg-[#F38118]/70" aria-hidden />
          <div className="relative z-10 flex flex-col items-center">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <div className="mt-1.5 h-0.5 w-12 rounded-full bg-[#F38118]" aria-hidden />
            <p className="mt-1.5 max-w-xl text-sm leading-snug text-slate-600">{subtitle}</p>
            {meta ? <p className="mt-1 text-xs text-slate-500">{meta}</p> : null}
          </div>
        </div>
        <GeometricBannerWing mirror />
      </div>
    </header>
  );
}

export function DashboardPageBanner({
  title,
  subtitle,
  meta,
  imageSrc = "/report-scam-banner.png",
  imageAlt = "Page banner illustration",
  compact = false,
  tone = "light",
  className = "",
}: DashboardPageBannerProps) {
  const isEmerald = compact && tone === "emerald";

  if (isEmerald) {
    return (
      <EmeraldGeometricBanner
        title={title}
        subtitle={subtitle}
        meta={meta}
        className={className}
      />
    );
  }

  return (
    <header
      className={`relative overflow-hidden rounded-2xl shadow-lg shadow-slate-900/10 ${className}`}
    >
      <div
        className="pointer-events-none absolute right-0 top-0 z-10 h-5 w-10 bg-[#F38118] sm:h-6 sm:w-12"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 z-10 h-5 w-10 bg-[#F38118] sm:h-6 sm:w-12"
        aria-hidden
      />

      <div className={`flex flex-col ${compact ? "" : "lg:flex-row lg:items-center"}`}>
        <div
          className={`relative min-w-0 flex-1 bg-white/55 backdrop-blur-md ${
            compact ? "px-5 py-4" : "px-5 py-4 sm:px-6 sm:py-5"
          }`}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent, transparent 18px, rgba(148,163,184,0.12) 18px, rgba(148,163,184,0.12) 19px)",
            }}
            aria-hidden
          />

          <div
            className="absolute bottom-0 left-0 top-0 z-0 w-2 rounded-r-md bg-[#F38118]"
            aria-hidden
          />

          <DotGrid className="pointer-events-none absolute right-4 top-3 z-0 scale-75 opacity-90" />

          <div className="relative z-10 pl-4 pr-10 sm:pl-5 sm:pr-12">
            <h1
              className={
                compact
                  ? "text-2xl font-semibold tracking-tight text-slate-900"
                  : "text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
              }
            >
              {title}
            </h1>
            <div className="mt-2 h-0.5 w-14 rounded-full bg-[#F38118] sm:w-16" aria-hidden />
            <p
              className={
                compact
                  ? "mt-2 max-w-xl text-sm leading-snug text-slate-600"
                  : "mt-2 max-w-xl text-sm leading-snug text-slate-600 sm:text-base"
              }
            >
              {subtitle}
            </p>
            {meta ? <p className="mt-1 text-xs text-slate-500">{meta}</p> : null}
          </div>
        </div>

        {!compact && imageSrc ? (
          <div className="relative w-full shrink-0 lg:w-[38%] xl:w-[34%]">
            <div className="relative p-3 sm:p-3.5 lg:py-3 lg:pl-0 lg:pr-4">
              <div className="overflow-hidden rounded-l-2xl border-2 border-black bg-black p-[2px] shadow-inner">
                <div className="overflow-hidden rounded-l-[0.9rem] border border-[#F38118]">
                  <div className="relative h-24 w-full sm:h-28">
                    <Image
                      src={imageSrc}
                      alt={imageAlt}
                      fill
                      className="object-cover object-center"
                      sizes="(max-width: 1024px) 100vw, 40vw"
                      priority
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
