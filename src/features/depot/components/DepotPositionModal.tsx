/**
 * Modal zum Erstellen/Bearbeiten einer Depot-Position.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createDepotPosition, updateDepotPosition, upsertDepotPrice } from "@/db/repositories/depot";
import type { DepotPosition } from "@/db/types";
import { parseAmountToCents } from "@/lib/money";

interface Props {
  open: boolean;
  assetId: number;
  position?: DepotPosition;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function DepotPositionModal({ open, assetId, position, onOpenChange, onSaved }: Props) {
  const { t } = useTranslation("depot");
  const isEdit = !!position;

  const [isin, setIsin] = useState("");
  const [name, setName] = useState("");
  const [shares, setShares] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  // Optional: manual current price entry
  const [manualPrice, setManualPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (position) {
      setIsin(position.isin);
      setName(position.name);
      setShares(position.shares_amount);
      setPurchasePrice((position.purchase_price_cents / 100).toFixed(2).replace(".", ","));
      setCurrency(position.currency);
      setManualPrice("");
    } else {
      setIsin("");
      setName("");
      setShares("");
      setPurchasePrice("");
      setCurrency("EUR");
      setManualPrice("");
    }
  }, [position, open]);

  async function handleSave() {
    if (!isin.trim() || !name.trim() || !shares.trim() || !purchasePrice.trim()) {
      toast.error(t("modal.errorRequiredFields"));
      return;
    }
    const purchaseCents = parseAmountToCents(purchasePrice.replace(",", "."));
    if (purchaseCents === null || isNaN(purchaseCents)) {
      toast.error(t("modal.errorInvalidPrice"));
      return;
    }
    setSaving(true);
    try {
      if (isEdit && position) {
        await updateDepotPosition(position.id, isin.trim(), name.trim(), shares.trim(), purchaseCents, currency);
      } else {
        await createDepotPosition(assetId, isin.trim(), name.trim(), shares.trim(), purchaseCents, currency);
      }
      // Optional: save manual price to depot_prices
      if (manualPrice.trim()) {
        const manualCents = parseAmountToCents(manualPrice.replace(",", "."));
        if (manualCents !== null && !isNaN(manualCents)) {
          const today = new Date().toISOString().split("T")[0];
          await upsertDepotPrice(isin.trim(), today, manualCents, currency);
        }
      }
      toast.success(isEdit ? t("modal.updated") : t("modal.added"));
      onSaved();
    } catch (e) {
      toast.error(t("modal.saveFailed", { error: String(e) }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("modal.titleEdit") : t("modal.titleNew")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="dp-isin">{t("modal.isinLabel")}</Label>
            <Input
              id="dp-isin"
              placeholder="DE0005140008"
              value={isin}
              onChange={(e) => setIsin(e.target.value.toUpperCase())}
              className="font-mono"
            />
            <p className="text-xs text-slate">{t("modal.isinHint")}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dp-name">{t("modal.nameLabel")}</Label>
            <Input
              id="dp-name"
              placeholder="Deutsche Bank AG"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="dp-shares">{t("modal.sharesLabel")}</Label>
              <Input
                id="dp-shares"
                placeholder="10,5"
                inputMode="decimal"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dp-purchase">{t("modal.purchasePriceLabel")}</Label>
              <Input
                id="dp-purchase"
                placeholder="98,50"
                inputMode="decimal"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dp-currency">{t("modal.currencyLabel")}</Label>
            <Input
              id="dp-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="max-w-[8rem] font-mono"
              maxLength={3}
            />
          </div>
          {/* Optional manual current price — for when automatic fetching is off */}
          <div className="space-y-1 border-t border-border pt-3">
            <Label htmlFor="dp-manual-price" className="text-xs text-slate">
              {t("modal.manualPriceLabel")}
            </Label>
            <Input
              id="dp-manual-price"
              placeholder="103,20"
              inputMode="decimal"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              className="max-w-[12rem]"
            />
            <p className="text-xs text-slate">{t("modal.manualPriceHint")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("modal.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {isEdit ? t("modal.save") : t("modal.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
