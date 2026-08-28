import { cn } from "@/lib/utils";

interface StepDotsProps {
  total: number;
  /** 0-basierter Index des aktuellen Schritts. */
  current: number;
  /** "current": nur aktueller Schritt hervorgehoben (brick). "cumulative": alle bisherigen bleiben hervorgehoben (sage). */
  variant: "current" | "cumulative";
}

export function StepDots({ total, current, variant }: StepDotsProps) {
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`Schritt ${current + 1} von ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const highlighted = variant === "cumulative" ? i <= current : i === current;
        return (
          <span
            key={i}
            className={cn(
              "h-1 w-5 rounded-pill transition-colors",
              highlighted
                ? variant === "cumulative"
                  ? "bg-sage"
                  : "bg-brick"
                : "bg-slate/25",
            )}
          />
        );
      })}
    </div>
  );
}
