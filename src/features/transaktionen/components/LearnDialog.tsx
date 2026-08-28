import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createRule } from "@/db/repositories/rules";
import { createMerchant, addMerchantAlias, suppressMerchant, getMerchant } from "@/db/repositories/merchants";
import { normalizeCounterparty } from "@/lib/merchant-match";
import type { TransactionWithTags } from "@/db/repositories/transactions";
import { showErrorToast } from "@/lib/errorToast";
import { useTranslation } from "react-i18next";

interface LearnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Zustand der Transaktion VOR der manuellen Korrektur (Herkunft/Händler der automatischen Zuordnung). */
  transaction: TransactionWithTags;
  newCategoryId: number;
  newCategoryName: string;
  onDone: () => void;
}

/**
 * Lern-Dialog (Product Spec Kap. 3, "Lernen bei manueller Korrektur"): erscheint, wenn der Nutzer
 * eine automatische Kategoriezuordnung (Regel/Vertrag/Transfer/Händler/Ähnlichkeit) manuell korrigiert.
 * - Händler korrekt erkannt, nur Kategorie falsch -> neue Benutzerregel (Empfänger -> Kategorie).
 * - Händler nicht erkannt -> neuer lokaler Händler + Alias in der Händler-DB.
 * - Zusatzoption bei globaler (kuratierter) Händler-Zuordnung: "bei mir nie anwenden" -> merchant_suppressions,
 *   statt den globalen Eintrag zu löschen.
 */
export function LearnDialog({ open, onOpenChange, transaction, newCategoryId, newCategoryName, onDone }: LearnDialogProps) {
  const { t } = useTranslation(["transaktionen", "app", "kategorien"]);
  const { data: matchedMerchant } = useQuery({
    queryKey: ["merchant", transaction.merchant_id],
    queryFn: () => getMerchant(transaction.merchant_id!),
    enabled: open && !!transaction.merchant_id,
  });

  async function handleLearn() {
    try {
      if (transaction.merchant_id) {
        // Händler war korrekt erkannt, nur die Kategorie war falsch -> neue Benutzerregel.
        await createRule(
          [{ field: "counterparty", operator: "contains", value: transaction.counterparty }],
          { category_id: newCategoryId, tag_id: null, mark_as_transfer: false, mark_as_saving: false, sparzweck_id: null },
          "aufraeumen",
        );
        toast.success(`${t("learnDialog.ruleCreated")}: „${transaction.counterparty}" → ${newCategoryName}`);
      } else {
        // Händler gar nicht erkannt -> neuer lokaler Alias in der Händler-DB.
        const canonical = normalizeCounterparty(transaction.counterparty) || transaction.counterparty.trim().toLowerCase();
        const merchantId = await createMerchant({
          canonical_name: canonical,
          display_name: transaction.counterparty.trim(),
          default_category_id: newCategoryId,
          is_builtin: 0,
        });
        await addMerchantAlias({ merchant_id: merchantId, match_type: "name_exact", match_value: canonical });
        toast.success(`${t("learnDialog.aliasCreated")}: „${transaction.counterparty}" → ${newCategoryName}`);
      }
    } catch (e) {
      showErrorToast(`${t("learnDialog.learnError")}: ${String(e)}`);
    } finally {
      onDone();
    }
  }

  async function handleSuppressGlobal() {
    if (!transaction.merchant_id) return;
    try {
      await suppressMerchant(transaction.merchant_id);
      const merchant = await getMerchant(transaction.merchant_id);
      toast.success(`„${merchant?.display_name ?? t("kategorien:merchants.fallback")}" ${t("learnDialog.suppressed")}`);
    } catch (e) {
      showErrorToast(`${t("app:errors.unknownError")}: ${String(e)}`);
    } finally {
      onDone();
    }
  }

  const isBuiltinMerchant = transaction.categorization_source === "merchant" && matchedMerchant?.is_builtin === 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t("learnDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("learnDialog.description", { category: newCategoryName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("learnDialog.noThanks")}
            </Button>
            <Button className="bg-sage text-card hover:bg-sage/90" onClick={() => void handleLearn()}>
              {t("learnDialog.yes")}
            </Button>
          </div>
          {isBuiltinMerchant && (
            <Button variant="outline" className="w-full" onClick={() => void handleSuppressGlobal()}>
              {t("learnDialog.suppressGlobal")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
