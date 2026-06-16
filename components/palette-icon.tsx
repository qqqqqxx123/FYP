interface PaletteIconProps {
  className?: string;
}

export function PaletteIcon({ className = "h-5 w-5" }: PaletteIconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        fill="#1B2A4A"
        d="M16 3.5C9.1 3.5 3.5 9.4 3.5 16c0 2.6.8 5 2.2 7 .4.6 1.1.9 1.8.7 1.1-.2 2.2-.3 3.3-.3 1.7 0 3.2.6 4.4 1.6 1 .8 2.2 1.3 3.5 1.3 4.4 0 8-3.6 8-8 0-7.1-5.8-13.8-12.7-13.8z"
      />
      <circle cx="11.5" cy="10.5" r="2" fill="#F87171" />
      <circle cx="8" cy="15.5" r="2" fill="#38BDF8" />
      <circle cx="10.5" cy="20.5" r="2" fill="#FACC15" />
      <circle cx="16" cy="21" r="2" fill="#4ADE80" />
      <circle cx="19.5" cy="8.5" r="2.4" fill="#FFFFFF" />
      <circle cx="24" cy="15.5" r="2" fill="#FFFFFF" />
    </svg>
  );
}
