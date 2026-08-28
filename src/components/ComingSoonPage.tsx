interface ComingSoonPageProps {
  title: string;
}

/** Platzhalter für Seiten außerhalb des Phase-1-Umfangs (siehe CLAUDE.md Phasenplan). */
export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="font-heading text-xl text-charcoal">{title}</h1>
      <p className="text-sm text-slate">Diese Seite folgt in einer späteren Phase.</p>
    </div>
  );
}
