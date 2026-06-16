import Image from "next/image";
import Link from "next/link";

interface PortalLogoProps {
  size?: number;
  href?: string;
  className?: string;
  priority?: boolean;
}

export function PortalLogo({
  size = 40,
  href,
  className = "",
  priority = false,
}: PortalLogoProps) {
  const image = (
    <Image
      src="/portal-icon.png"
      alt="AI.S.D.S logo"
      width={size}
      height={size}
      className={`object-contain ${className}`}
      priority={priority}
    />
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0 items-center" aria-label="AI.S.D.S home">
        {image}
      </Link>
    );
  }

  return <span className="inline-flex shrink-0 items-center">{image}</span>;
}
