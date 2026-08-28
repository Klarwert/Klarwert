interface KlarwertMarkProps {
  className?: string;
}

/** Reduziertes Icon-Motiv (ohne Schriftzug) aus klarwert-icon.svg, für kleine Flächen (Sidebar, Favicon-Kontext). */
export function KlarwertMark({ className }: KlarwertMarkProps) {
  return (
    <svg viewBox="0 0 256 256" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="256" height="256" rx="56" fill="#123138" />
      <rect x="74" y="81" width="108" height="22" rx="11" fill="#f3efe4" />
      <rect x="74" y="117" width="84" height="22" rx="11" fill="#f3efe4" opacity="0.72" />
      <rect x="74" y="153" width="60" height="22" rx="11" fill="#6f9a6d" />
    </svg>
  );
}

interface KlarwertLogoProps {
  className?: string;
}

/** Icon + Schriftzug aus klarwert-logo.svg, für Sidebar-Kopf und Profil/Über-Bereich. */
export function KlarwertLogo({ className }: KlarwertLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className || ""}`}>
      <KlarwertMark className="size-7 shrink-0" />
      <span className="font-heading text-[18px] font-medium leading-none text-charcoal">
        Klarwert
      </span>
    </div>
  );
}
