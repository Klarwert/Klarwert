import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { applyMerchantDataRelease, type MerchantDataRelease } from "@/db/repositories/merchants";
import type { Category, Merchant } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

interface MerchantUpdateCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMerchants: Merchant[];
  categories: Category[];
  onApplied: () => void;
}

/** Statische Rohdatei im Community-Repo, siehe klarwert-community-haendler-db.md, Abschnitt 4. */
const COMMUNITY_DATA_URL =
  "https://raw.githubusercontent.com/Klarwert/Klarwert-Community-Rules/main/haendler.json";

interface DiffRow {
  canonical_name: string;
  display_name: string;
  status: "new" | "changed";
  /** Lokal bereits angepasst (is_modified=1) – Übernahme würde die eigene Anpassung überschreiben. */
  localModified: boolean;
}

/** B15 "update"-Variante: Diff der kuratierten Community-Datei vor der Übernahme (Alles-oder-Nichts). */
export function MerchantUpdateCheckDialog({
  open,
  onOpenChange,
  currentMerchants,
  categories,
  onApplied,
}: MerchantUpdateCheckDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [release, setRelease] = useState<MerchantDataRelease | null>(null);
  const [diff, setDiff] = useState<DiffRow[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRelease(null);
    setDiff([]);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(COMMUNITY_DATA_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: MerchantDataRelease = await res.json();
        const byCanonical = new Map(currentMerchants.map((m) => [m.canonical_name, m]));
        const templateKeyById = new Map(categories.map((c) => [c.id, c.template_key]));
        const rows: DiffRow[] = [];
        for (const m of data.merchants) {
          const existing = byCanonical.get(m.canonical_name);
          if (!existing) {
            rows.push({ canonical_name: m.canonical_name, display_name: m.display_name, status: "new", localModified: false });
            continue;
          }
          const currentTemplateKey = existing.default_category_id
            ? templateKeyById.get(existing.default_category_id) ?? null
            : null;
          if (
            existing.display_name !== m.display_name ||
            (currentTemplateKey ?? null) !== (m.default_category_template_key ?? null)
          ) {
            rows.push({
              canonical_name: m.canonical_name,
              display_name: m.display_name,
              status: "changed",
              localModified: existing.is_modified === 1,
            });
          }
        }
        setRelease(data);
        setDiff(rows);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, currentMerchants, categories]);

  async function handleApply() {
    if (!release) return;
    setApplying(true);
    try {
      await applyMerchantDataRelease(release);
      queryClient.invalidateQueries({ queryKey: ["merchants"] });
      toast.success(`Händler-Datenbank aktualisiert (Stand ${release.source_version})`);
      onApplied();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`Fehler bei der Übernahme: ${String(e)}`);
    } finally {
      setApplying(false);
    }
  }

  const newCount = diff.filter((d) => d.status === "new").length;
  const changedCount = diff.filter((d) => d.status === "changed").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Regel-Update prüfen</DialogTitle>
          <DialogDescription>
            Lädt die kuratierte Händler-Datei aus dem Community-Repo und zeigt vor der Übernahme genau, was sich
            ändert.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <p className="flex items-center gap-2 p-3 text-sm text-slate">
            <Loader2 className="size-4 animate-spin" /> Lädt…
          </p>
        )}
        {error && (
          <p className="p-3 text-sm text-brick">
            Konnte die Community-Datei nicht laden: {error}
          </p>
        )}
        {!loading && !error && release && (
          <>
            <p className="text-sm text-charcoal">
              {newCount} neu / {changedCount} geändert (Stand {release.source_version})
            </p>
            <div className="max-h-[280px] space-y-1 overflow-y-auto">
              {diff.length === 0 && <p className="p-3 text-sm text-slate">Deine Händler-Datenbank ist aktuell.</p>}
              {diff.map((d) => (
                <div key={d.canonical_name} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                  {d.status === "new" ? (
                    <Sparkles className="size-3.5 shrink-0 text-sage" />
                  ) : (
                    <RefreshCw className="size-3.5 shrink-0 text-gold" />
                  )}
                  <span className="text-charcoal">{d.display_name}</span>
                  {d.localModified && (
                    <span className="text-xs text-gold">eigene Anpassung – wird nicht überschrieben</span>
                  )}
                  <span className="ml-auto text-xs text-slate">{d.status === "new" ? "neu" : "geändert"}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => void handleApply()} disabled={!release || diff.length === 0 || applying}>
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
