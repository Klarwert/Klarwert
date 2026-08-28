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
import { Sparkles, RefreshCw, Loader2, Trash2 } from "lucide-react";
import { applyMerchantDataRelease, parseMerchantDataRelease, type MerchantDataRelease } from "@/db/repositories/merchants";
import type { Category, Merchant } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import { computeMerchantReleaseDiff, type DiffRow } from "@/lib/merchantReleaseDiff";
import { useTranslation } from "react-i18next";

interface MerchantUpdateCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMerchants: Merchant[];
  categories: Category[];
  onApplied: () => void;
}

/**
 * Statische, von Klarwert-Community-Rules per CI generierte Distributionsdatei (siehe dort
 * scripts/build.mjs) - liegt auf `main` unter `dist/`, weil raw.githubusercontent.com nur Dateien
 * ausliefern kann, die tatsächlich im Branch committed sind (kein Server, kein Release-Upload).
 */
const COMMUNITY_DATA_URL =
  "https://raw.githubusercontent.com/Klarwert/Klarwert-Community-Rules/main/dist/haendler.json";

/** B15 "update"-Variante: Diff der kuratierten Community-Datei vor der Übernahme (Alles-oder-Nichts). */
export function MerchantUpdateCheckDialog({
  open,
  onOpenChange,
  currentMerchants,
  categories,
  onApplied,
}: MerchantUpdateCheckDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation(["kategorien", "app"]);
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
    void (async () => {
      try {
        const res = await fetch(COMMUNITY_DATA_URL);
        if (res.status === 404) {
          throw new Error(t("merchants.updateCheck.dbPending"));
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = parseMerchantDataRelease(await res.json());
        const rows = computeMerchantReleaseDiff(currentMerchants, categories, data);
        setRelease(data);
        setDiff(rows);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, currentMerchants, categories, t]);

  async function handleApply() {
    if (!release) return;
    setApplying(true);
    try {
      await applyMerchantDataRelease(release);
      void queryClient.invalidateQueries({ queryKey: ["merchants"] });
      toast.success(t("merchants.updateCheck.success", { version: release.source_version }));
      onApplied();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`${t("app:errors.unknownError")}: ${String(e)}`);
    } finally {
      setApplying(false);
    }
  }

  const newCount = diff.filter((d) => d.status === "new").length;
  const changedCount = diff.filter((d) => d.status === "changed").length;
  const deprecatedCount = diff.filter((d) => d.status === "deprecated").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("merchants.checkUpdate")}</DialogTitle>
          <DialogDescription>
            {t("merchants.updateCheck.desc")}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <p className="flex items-center gap-2 p-3 text-sm text-slate">
            <Loader2 className="size-4 animate-spin" /> {t("app:common.loading")}
          </p>
        )}
        {error && (
          <p className="p-3 text-sm text-brick">
            {error.includes("Community-Datenbank") ? error : t("merchants.updateCheck.loadError", { error })}
          </p>
        )}
        {!loading && !error && release && (
          <>
            <p className="text-sm text-charcoal">
              {t("merchants.updateCheck.summary", { newCount, changedCount, deprecatedCount, version: release.source_version })}
            </p>
            <div className="max-h-[280px] space-y-1 overflow-y-auto">
              {diff.length === 0 && <p className="p-3 text-sm text-slate">{t("merchants.updateCheck.upToDate")}</p>}
              {diff.map((d) => (
                <div key={d.canonical_name} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                  {d.status === "new" && <Sparkles className="size-3.5 shrink-0 text-sage" />}
                  {d.status === "changed" && <RefreshCw className="size-3.5 shrink-0 text-gold" />}
                  {d.status === "deprecated" && <Trash2 className="size-3.5 shrink-0 text-brick" />}
                  <span className="text-charcoal">{d.display_name}</span>
                  {d.localModified && (
                    <span className="text-xs text-gold">{t("merchants.updateCheck.localModified")}</span>
                  )}
                  <span className="ml-auto text-xs text-slate">
                    {d.status === "new" ? t("merchants.updateCheck.statusNew") : d.status === "changed" ? t("merchants.updateCheck.statusChanged") : t("merchants.updateCheck.statusDeprecated")}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("app:common.cancel")}</Button>
          <Button onClick={() => void handleApply()} disabled={!release || diff.length === 0 || applying}>
            {t("merchants.updateCheck.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
