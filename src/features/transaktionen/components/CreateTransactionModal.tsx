import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/AmountInput";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelect } from "@/components/CategorySelect";
import { useAssets } from "@/hooks/useAssets";
import { createManualTransaction } from "@/db/repositories/transactions";
import { runPipelineForTransactions } from "@/lib/pipeline";
import { parseAmountToCents } from "@/lib/money";
import { todayIso } from "@/lib/dates";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import { useTranslation } from "react-i18next";

interface CreateTransactionModalProps {
  open: boolean;
  defaultAssetId?: number | null;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateTransactionModal({
  open,
  defaultAssetId,
  onOpenChange,
  onCreated,
}: CreateTransactionModalProps) {
  const { t } = useTranslation(["transaktionen", "app"]);
  const { data: assets } = useAssets(false);
  const accountAssets = (assets ?? []).filter((a) => a.kind === "account");

  const [assetId, setAssetId] = useState<number | null>(defaultAssetId ?? null);
  const [date, setDate] = useState(todayIso());
  const [counterparty, setCounterparty] = useState("");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setAssetId(defaultAssetId ?? null);
    setDate(todayIso());
    setCounterparty("");
    setPurpose("");
    setAmount("");
    setCategoryId(null);
  }

  async function handleSubmit() {
    if (!assetId || !counterparty.trim() || !amount.trim()) return;
    let cents: number;
    try {
      cents = parseAmountToCents(amount);
    } catch {
      showErrorToast(t("app:common.invalidAmount"));
      return;
    }
    if (cents === 0) {
      showErrorToast(t("app:common.amountNotZero"));
      return;
    }
    setSubmitting(true);
    try {
      const newId = await createManualTransaction({
        asset_id: assetId,
        booking_date: date,
        counterparty: counterparty.trim(),
        purpose: purpose.trim() || null,
        amount_cents: cents,
        category_id: categoryId,
      });
      await runPipelineForTransactions([newId]);
      toast.success(t("create.saved"));
      onCreated();
      reset();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`${t("app:common.error")}: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tx-asset">{t("create.account")}</Label>
            <Select
              value={assetId ? String(assetId) : undefined}
              onValueChange={(v) => setAssetId(Number(v))}
            >
              <SelectTrigger id="tx-asset">
                <SelectValue placeholder={t("app:common.selectAccount")} />
              </SelectTrigger>
              <SelectContent>
                {accountAssets.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">{t("create.date")}</Label>
              <DateInput id="tx-date" max={todayIso()} value={date} onChange={setDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">{t("create.amount")}</Label>
              <AmountInput id="tx-amount" placeholder="-45,00" value={amount} onChange={setAmount} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-counterparty">{t("create.counterparty")}</Label>
            <Input
              id="tx-counterparty"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-purpose">{t("create.purpose")}</Label>
            <Input id="tx-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("create.category")}</Label>
            <CategorySelect value={categoryId} onChange={setCategoryId} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("app:common.cancel")}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || !assetId || !counterparty.trim() || !amount.trim()}
          >
            {t("create.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
