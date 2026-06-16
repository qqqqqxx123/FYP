/** Decorative dashboard backdrop — CSS/SVG only, no image files. */
export function DashboardBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-[#fde8d8] via-[#faf6f1] to-[#f0e6d8]" />

      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage: "radial-gradient(circle, #b8956a 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <svg
        className="absolute inset-0 h-full w-full opacity-[0.07]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="dash-diag" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="28" height="28" fill="none" stroke="#9a6b45" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dash-diag)" />
      </svg>

      {/* Top-left terracotta block */}
      <div className="absolute -left-6 top-16 h-28 w-28 rotate-[-18deg] rounded-2xl bg-[#c45c3e]/75 shadow-lg shadow-[#c45c3e]/20 sm:h-36 sm:w-36" />
      <div className="absolute left-24 top-8 h-14 w-14 rounded-full border-[3px] border-[#c45c3e]/50 bg-[#e8a88e]/40" />

      {/* Top-right olive + dots */}
      <div className="absolute right-8 top-12 h-24 w-24 rotate-12 rounded-2xl bg-[#6b7c4c]/70 sm:right-20 sm:h-32 sm:w-32">
        <svg className="h-full w-full p-3 text-white/30" viewBox="0 0 100 100" fill="none" aria-hidden>
          <path
            d="M8 55c18-22 36-28 54-18M12 72c22-8 40-6 58 10M6 38c20-12 38-10 56 4"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div
        className="absolute right-32 top-28 h-16 w-16 opacity-60 sm:right-48"
        style={{
          backgroundImage: "radial-gradient(circle, #6b7c4c 2px, transparent 2px)",
          backgroundSize: "8px 8px",
        }}
      />

      {/* Bottom-left tan shapes */}
      <div className="absolute bottom-24 left-10 h-20 w-20 rotate-6 rounded-full bg-[#d4a574]/55 sm:h-28 sm:w-28" />
      <div className="absolute bottom-16 left-32 h-16 w-16 rotate-[-12deg] rounded-xl bg-[#b8956a]/65 sm:left-44 sm:h-20 sm:w-20" />

      {/* Bottom-right terracotta + circle outline */}
      <div className="absolute bottom-20 right-16 h-24 w-24 rotate-[22deg] rounded-2xl bg-[#c45c3e]/60 sm:right-28 sm:h-32 sm:w-32" />
      <div className="absolute bottom-32 right-8 h-20 w-20 rounded-full border-4 border-[#c45c3e]/35 sm:right-12" />

      {/* Center-soft mint/teal accents (subtle tech feel) */}
      <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[#a8d5c8]/25 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 h-48 w-48 rounded-full bg-[#7ec8b8]/20 blur-3xl" />

      {/* Sweeping curves */}
      <svg
        className="absolute inset-0 h-full w-full text-[#c4a574]/20"
        viewBox="0 0 1440 900"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M-40 720C220 560 420 480 720 420C1020 360 1180 300 1520 180"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M-80 820C180 680 400 600 700 540C1000 480 1200 400 1540 280"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />
      </svg>

      <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-[#f5e6d6]/40" />
    </div>
  );
}
