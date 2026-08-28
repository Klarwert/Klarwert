import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelect } from "@/components/CategorySelect";
import { formatEur } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { getRecentTransactionsForContract, updateContract, createManualContract, deleteContract, generateRuleForContract } from "@/db/repositories/contracts";
import { addHistoryEntry } from "@/db/repositories/historyLog";
import { getTransaction } from "@/db/repositories/transactions";
import type { Contract, ContractInterval, ContractStatus } from "@/db/types";
import type { TransactionWithTags } from "@/db/repositories/transactions";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { TransactionDrawer } from "@/features/transaktionen/components/TransactionDrawer";
import { showErrorToast } from "@/lib/errorToast";
import { useTranslation } from "react-i18next";

interface ContractDrawerProps {
  contract: Contract | "new" | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const STATUS_KEYS = [
  "detected",
  "confirmed",
  "price_changed",
  "paused",
  "suggested_ended",
  "ended",
] as const;

const INTERVAL_KEYS = [
  "monthly",
  "quarterly",
  "yearly",
  "weekly",
  "irregular",
] as const;

export function ContractDrawer({ contract, onOpenChange, onChanged }: ContractDrawerProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("vertraege");
  const isNew = contract === "new";
  const contractId = isNew || !contract ? null : contract.id;

  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [interval, setInterval] = useState<ContractInterval>("monthly");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [status, setStatus] = useState<ContractStatus>("confirmed");
  const [selectedTx, setSelectedTx] = useState<TransactionWithTags | null>(null);
  
  useEffect(() => {
    if (contract === "new") {
      setName("");
      setAmountStr("");
      setInterval("monthly");
      setCategoryId(null);
      setStatus("confirmed");
    } else if (contract) {
      setName(contract.name);
      setAmountStr((contract.current_amount_cents / 100).toFixed(2));
      setInterval(contract.interval);
      setCategoryId(contract.category_id);
      setStatus(contract.status);
    }
  }, [contract]);

  const { data: recent } = useQuery({
    queryKey: ["contract-transactions", contractId],
    queryFn: () => getRecentTransactionsForContract(contractId!),
    enabled: !!contractId,
  });

  if (!contract) return null;

  async function handleSave() {
    const cents = Math.round(parseFloat(amountStr.replace(",", ".")) * 100);
    if (!name.trim() || isNaN(cents)) {
      showErrorToast(t("drawer.invalidInput"));
      return;
    }

    if (isNew) {
      const id = await createManualContract(name.trim(), interval, categoryId, [], cents);
      await generateRuleForContract(id);
      toast.success(t("drawer.created"));
    } else if (contractId) {
      await updateContract(contractId, {
        name: name.trim(),
        current_amount_cents: cents,
        interval,
        category_id: categoryId,
        status,
      });
      toast.success(t("drawer.updated"));
    }
    
    void queryClient.invalidateQueries({ queryKey: ["contracts"] });
    onChanged();
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!contractId) return;
    if (confirm(t("drawer.deleteConfirm"))) {
      await deleteContract(contractId);
      await addHistoryEntry({
        action_type: "contract_delete",
        description: `Vertrag "${name}" gelöscht`,
        payload: { contractId },
      });
      toast.success(t("drawer.deleted"));
      void queryClient.invalidateQueries({ queryKey: ["contracts"] });
      onChanged();
      onOpenChange(false);
    }
  }

  return (
    <Sheet open={!!contract} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[390px] flex-col sm:max-w-[390px]">
        <SheetHeader>
          <SheetTitle>{isNew ? t("add") : t("edit")}</SheetTitle>
        </SheetHeader>
        
        <div className="flex-1 space-y-4 overflow-y-auto py-4 text-sm">
          <div className="space-y-1.5">
            <Label>{t("drawer.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Netflix" />
          </div>

          <div className="space-y-1.5">
            <Label>{t("drawer.amount")}</Label>
            <Input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} type="number" step="0.01" />
          </div>

          <div className="space-y-1.5">
            <Label>{t("drawer.interval")}</Label>
            <Select value={interval} onValueChange={(v) => setInterval(v as ContractInterval)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`interval.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ContractStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_KEYS.filter((s) => isNew ? s === "confirmed" || s === "ended" : s !== "detected").map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("drawer.category")}</Label>
            <CategorySelect value={categoryId} onChange={setCategoryId} allowNone={true} />
          </div>

          {!isNew && (
            <div className="pt-4 border-t border-border space-y-3">
              <Label>{t("drawer.lastBookings")}</Label>
              <div className="space-y-1.5">
                {(!recent || recent.length === 0) && <p className="text-xs text-slate">{t("drawer.noBookings")}</p>}
                {recent?.map((tx) => (
                  <button key={tx.id} type="button"
                    onClick={() => void getTransaction(tx.id).then(full => full && setSelectedTx(full))}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-accent"
                  >
                    <span className="text-slate">{formatDate(tx.booking_date)}</span>
                    <span className="num text-charcoal">{formatEur(tx.amount_cents)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          {!isNew ? (
            <Button variant="ghost" size="icon" onClick={() => void handleDelete()}>
              <Trash2 className="size-4 text-brick" />
            </Button>
          ) : <div></div>}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("drawer.cancel")}
            </Button>
            <Button onClick={() => void handleSave()}>{t("drawer.save")}</Button>
          </div>
        </div>
      </SheetContent>

      <TransactionDrawer
        transaction={selectedTx}
        onOpenChange={(o) => !o && setSelectedTx(null)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ["contract-transactions"] })}
      />
    </Sheet>
  );
}
