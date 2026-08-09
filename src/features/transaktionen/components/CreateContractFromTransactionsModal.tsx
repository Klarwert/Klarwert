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
  const [name, setName] = useState("");
  const [interval, setInterval] = useState<ContractInterval>("monthly");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      showErrorToast("Bitte einen Namen angeben.");
      return;
    }
    setSaving(true);
    try {
      const contractId = await createManualContract(name.trim(), interval, categoryId, selectedIds);
      await generateRuleForContract(contractId);
      toast.success("Vertrag erstellt und Transaktionen verknüpft.");
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onCompleted();
      onOpenChange(false);
      setName("");
      setInterval("monthly");
      setCategoryId(null);
    } catch (e) {
      showErrorToast(`Fehler: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Als Vertrag zusammenfassen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <p className="text-sm text-slate">
            Erstelle einen neuen Vertrag aus {selectedIds.length} ausgewählten Transaktionen.
          </p>
          
          <div className="space-y-1.5">
            <Label htmlFor="contract-name">Name des Vertrags</Label>
            <Input 
              id="contract-name" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="z.B. Netflix, Miete..." 
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contract-interval">Intervall</Label>
            <Select value={interval} onValueChange={(v) => setInterval(v as ContractInterval)}>
              <SelectTrigger id="contract-interval">
                <SelectValue placeholder="Intervall wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monatlich</SelectItem>
                <SelectItem value="quarterly">Vierteljährlich</SelectItem>
                <SelectItem value="yearly">Jährlich</SelectItem>
                <SelectItem value="irregular">Unregelmäßig</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Kategorie (optional)</Label>
            <CategorySelect 
              value={categoryId} 
              onChange={setCategoryId} 
              placeholder="Vertragskategorie wählen" 
              allowNone 
            />
            <p className="text-xs text-slate">
              Wird auf alle ausgewählten Transaktionen angewendet.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            {saving ? "Speichert..." : "Erstellen & Verknüpfen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
