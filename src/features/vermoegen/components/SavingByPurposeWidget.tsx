import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { formatEur } from "@/lib/money";
import { useSparzwecke } from "@/hooks/useSparzwecke";
import { getCumulativeSaving } from "@/db/repositories/sparzwecke";

export function SavingByPurposeWidget() {
  const { data: sparzwecke } = useSparzwecke();

  const { data: totals } = useQuery({
    queryKey: ["sparzwecke-totals", sparzwecke?.map((s) => s.id)],
    queryFn: async () => {
      const entries = await Promise.all(
        (sparzwecke ?? []).map(async (s) => [s.id, await getCumulativeSaving(s.id)] as const),
      );
      return Object.fromEntries(entries);
    },
    enabled: !!sparzwecke,
  });

  if (!sparzwecke || sparzwecke.length === 0) {
    return <p className="text-sm text-slate">Keine Sparzwecke angelegt.</p>;
  }

  return (
    <div className="space-y-3">
      {sparzwecke.map((s) => {
        const total = totals?.[s.id] ?? 0;
        const progress = s.target_cents ? Math.min(100, (total / s.target_cents) * 100) : null;
        return (
          <div key={s.id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-charcoal">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </span>
              <span className="num text-charcoal">
                {formatEur(total)}
                {s.target_cents ? ` / ${formatEur(s.target_cents)}` : ""}
              </span>
            </div>
            {progress !== null && <Progress value={progress} className="h-2" />}
          </div>
        );
      })}
    </div>
  );
}
