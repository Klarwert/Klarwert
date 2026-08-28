import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelect } from "@/components/CategorySelect";
import { createManualContract, generateRuleForContract } from "@/db/repositories/contracts";
import type { ContractInterval } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import { useTranslation } from "react-i18next";

interface CreateContractFromTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: number[];
  onCompleted: () => void;
}

export function CreateContractFromTransactionsModal({
  open,
  onOpenChange,
  selectedIds,
  onCompleted,
}: CreateContractFromTransactionsModalProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation(["vertraege", "app"]);
  const [name, setName] = useState("");
  const [interval, setInterval] = useState<ContractInterval>("monthly");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      showErrorToast(t("fromTransactions.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const contractId = await createManualContract(name.trim(), interval, categoryId, selectedIds);
      await generateRuleForContract(contractId);
      toast.success(t("fromTransactions.createdSuccess"));
      void queryClient.invalidateQueries({ queryKey: ["contracts"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onCompleted();
      onOpenChange(false);
      setName("");
      setInterval("monthly");
      setCategoryId(null);
    } catch (e) {
      showErrorToast(`${t("app:errors.unknownError")}: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("fromTransactions.title")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <p className="text-sm text-slate">
            {t("fromTransactions.description", { count: selectedIds.length })}
          </p>
          
          <div className="space-y-1.5">
            <Label htmlFor="contract-name">{t("fromTransactions.contractName")}</Label>
            <Input 
              id="contract-name" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder={t("fromTransactions.namePlaceholder")} 
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contract-interval">{t("drawer.interval")}</Label>
            <Select value={interval} onValueChange={(v) => setInterval(v as ContractInterval)}>
              <SelectTrigger id="contract-interval">
                <SelectValue placeholder={t("fromTransactions.intervalPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t("interval.monthly")}</SelectItem>
                <SelectItem value="quarterly">{t("interval.quarterly")}</SelectItem>
                <SelectItem value="yearly">{t("interval.yearly")}</SelectItem>
                <SelectItem value="irregular">{t("interval.irregular")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("fromTransactions.categoryOptional")}</Label>
            <CategorySelect 
              value={categoryId} 
              onChange={setCategoryId} 
              placeholder={t("fromTransactions.categoryPlaceholder")} 
              allowNone 
            />
            <p className="text-xs text-slate">
              {t("fromTransactions.categoryApplied")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("app:common.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            {saving ? t("app:common.saving") : t("fromTransactions.createBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
