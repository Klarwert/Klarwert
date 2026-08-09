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

interface ContractDrawerProps {
  contract: Contract | "new" | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const STATUS_LABELS: Record<ContractStatus, string> = {
  detected: "Neu erkannt",
  confirmed: "Bestätigt",
  price_changed: "Preisänderung erkannt",
  paused: "Pausiert",
  ended: "Beendet",
};

const INTERVAL_LABELS: Record<ContractInterval, string> = {
  monthly: "Monatlich",
  quarterly: "Vierteljährlich",
  yearly: "Jährlich",
  irregular: "Unregelmäßig",
};

export function ContractDrawer({ contract, onOpenChange, onChanged }: ContractDrawerProps) {
  const queryClient = useQueryClient();
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
      showErrorToast("Bitte Name und gültigen Betrag eingeben");
      return;
    }

    if (isNew) {
      const id = await createManualContract(name.trim(), interval, categoryId, [], cents);
      await generateRuleForContract(id);
      toast.success("Vertrag angelegt");
    } else if (contractId) {
      await updateContract(contractId, {
        name: name.trim(),
        current_amount_cents: cents,
        interval,
        category_id: categoryId,
        status,
      });
      toast.success("Vertrag aktualisiert");
    }
    
    queryClient.invalidateQueries({ queryKey: ["contracts"] });
    onChanged();
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!contractId) return;
    if (confirm("Vertrag wirklich löschen? Verknüpfte Buchungen werden wieder 'Unkategorisiert'.")) {
      await deleteContract(contractId);
      await addHistoryEntry({
        action_type: "contract_delete",
        description: `Vertrag "${name}" gelöscht`,
        payload: { contractId },
      });
      toast.success("Vertrag gelöscht");
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      onChanged();
      onOpenChange(false);
    }
  }

  return (
    <Sheet open={!!contract} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[390px] flex-col sm:max-w-[390px]">
        <SheetHeader>
          <SheetTitle>{isNew ? "Neuer Vertrag" : "Vertrag bearbeiten"}</SheetTitle>
        </SheetHeader>
        
        <div className="flex-1 space-y-4 overflow-y-auto py-4 text-sm">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Netflix" />
          </div>

          <div className="space-y-1.5">
            <Label>Betrag (€)</Label>
            <Input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} type="number" step="0.01" />
          </div>

          <div className="space-y-1.5">
            <Label>Turnus</Label>
            <Select value={interval} onValueChange={(v) => setInterval(v as ContractInterval)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(INTERVAL_LABELS) as ContractInterval[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {INTERVAL_LABELS[s]}
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
                {(Object.keys(STATUS_LABELS) as ContractStatus[])
                  .filter((s) => isNew ? s === "confirmed" || s === "ended" : s !== "detected")
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Kategorie</Label>
            <CategorySelect value={categoryId} onChange={(v) => setCategoryId(v)} />
          </div>

          {!isNew && (
            <div className="pt-4">
              <Label>Letzte Buchungen</Label>
              <div className="mt-2 space-y-1">
                {recent?.map((tx) => (
                  <button 
                    key={tx.id} 
                    type="button"
                    onClick={() => void getTransaction(tx.id).then(full => full && setSelectedTx(full))}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-accent"
                  >
                    <span className="text-slate">{formatDate(tx.booking_date)}</span>
                    <span className="num text-charcoal">{formatEur(tx.amount_cents)}</span>
                  </button>
                ))}
                {(!recent || recent.length === 0) && <p className="text-xs text-slate">Keine Buchungen verknüpft.</p>}
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={() => void handleSave()}>Speichern</Button>
          </div>
        </div>
      </SheetContent>

      <TransactionDrawer
        transaction={selectedTx}
        onOpenChange={(o) => !o && setSelectedTx(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["contract-transactions"] })}
      />
    </Sheet>
  );
}
