import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Github } from "lucide-react";
import { listMerchantAliases } from "@/db/repositories/merchants";
import type { Category, Merchant } from "@/db/types";

interface ShareSuggestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Eigene Händler (is_builtin = 0) mit gesetzter Standardkategorie – nur diese sind teilbar. */
  ownMerchants: Merchant[];
  categories: Category[];
}

/** GitHub-Issue-Template im Community-Repo, siehe klarwert-community-haendler-db.md. */
const COMMUNITY_ISSUE_URL = "https://github.com/Klarwert/Klarwert-Community-Rules/issues/new";

/** B15 "export"-Variante: Zeile-für-Zeile-Vorschau vor dem Teilen von Händler→Kategorie-Vorschlägen. */
export function ShareSuggestionsDialog({ open, onOpenChange, ownMerchants, categories }: ShareSuggestionsDialogProps) {
  const rows = useMemo(
    () =>
      ownMerchants
        .filter((m) => m.default_category_id !== null)
        .map((m) => ({
          merchant: m,
          categoryName: categories.find((c) => c.id === m.default_category_id)?.name ?? "?",
        })),
    [ownMerchants, categories],
  );
  const [selected, setSelected] = useState<Set<number>>(() => new Set(rows.map((r) => r.merchant.id)));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleGithubIssue() {
    const chosen = rows.filter((r) => selected.has(r.merchant.id));
    const lines = chosen.map((r) => `- ${r.merchant.display_name} → ${r.categoryName}`).join("\n");
    const body = `Vorgeschlagene Händler→Kategorie-Zuordnungen:\n\n${lines}\n\n(Erzeugt von Klarwert – enthält ausschließlich Händler→Kategorie-Zuordnungen, keine Beträge/Daten/Kontodaten.)`;
    const url = `${COMMUNITY_ISSUE_URL}?title=${encodeURIComponent("Neue Händler-Vorschläge")}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  }

  /**
   * "Datei herunterladen" – zweite, gleichwertige Option neben dem GitHub-Issue (Konzept Abschnitt 4):
   * dieselbe JSON-Struktur wie applyMerchantDataRelease erwartet, ohne dass ein GitHub-Account
   * vorausgesetzt wird. Wie die Datei danach zum Maintainer gelangt (Discord, Forum, E-Mail),
   * muss die App nicht wissen.
   */
  async function handleDownload() {
    const chosen = rows.filter((r) => selected.has(r.merchant.id));
    const merchants = await Promise.all(
      chosen.map(async (r) => {
        const aliases = await listMerchantAliases(r.merchant.id);
        const category = categories.find((c) => c.id === r.merchant.default_category_id);
        return {
          canonical_name: r.merchant.canonical_name,
          display_name: r.merchant.display_name,
          default_category_template_key: category?.template_key ?? null,
          aliases: aliases.map((a) => ({ type: a.match_type, value: a.match_value })),
        };
      }),
    );
    const payload = { source_version: new Date().toISOString().slice(0, 10), merchants };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "klarwert-haendler-vorschlaege.json";
    a.click();
    URL.revokeObjectURL(url);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Vorschläge teilen</DialogTitle>
          <DialogDescription>
            Es werden ausschließlich Händler→Kategorie-Zuordnungen geteilt, niemals Beträge, Daten oder Kontodaten.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-slate" aria-live="polite">
          {selected.size} von {rows.length} ausgewählt
        </p>
        <div className="max-h-[320px] space-y-1 overflow-y-auto">
          {rows.length === 0 && (
            <p className="p-3 text-sm text-slate">Keine eigenen Händler-Zuordnungen mit Kategorie vorhanden.</p>
          )}
          {rows.map((r) => (
            <label
              key={r.merchant.id}
              className={`flex items-center gap-2 rounded-md border border-border p-2 text-sm ${
                selected.has(r.merchant.id) ? "" : "opacity-50"
              }`}
            >
              <Checkbox checked={selected.has(r.merchant.id)} onCheckedChange={() => toggle(r.merchant.id)} />
              <span className="text-charcoal">{r.merchant.display_name}</span>
              <span className="text-slate">→</span>
              <span className="text-slate">{r.categoryName}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button variant="outline" onClick={() => void handleDownload()} disabled={selected.size === 0}>
            <Download className="mr-1.5 size-4" /> Datei herunterladen
          </Button>
          <Button onClick={handleGithubIssue} disabled={selected.size === 0}>
            <Github className="mr-1.5 size-4" /> GitHub-Issue öffnen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
