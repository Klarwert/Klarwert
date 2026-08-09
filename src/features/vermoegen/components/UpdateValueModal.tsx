import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/AmountInput";
import { DateInput } from "@/components/DateInput";
import { Label } from "@/components/ui/label";
import { addValueHistoryEntry } from "@/db/repositories/valueHistory";
import { setLastConfirmedBalance } from "@/db/repositories/assets";
import { parseAmountToCents } from "@/lib/money";
import { todayIso } from "@/lib/dates";
import type { AssetWithOwners } from "@/db/repositories/assets";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

interface UpdateValueModalProps {
  asset: AssetWithOwners | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** 5.3 Wert aktualisieren (Wertgegenstand) – append-only neuer Historien-Eintrag. */
export function UpdateValueModal({ asset, onOpenChange, onSaved }: UpdateValueModalProps) {
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (asset) {
      setValue("");
      setDate(todayIso());
    }
  }, [asset]);

  if (!asset) return null;

  async function handleSubmit() {
    if (!asset || !value.trim()) return;
    setSubmitting(true);
    try {
      const cents = parseAmountToCents(value);
      if (asset.kind === "account") {
        // Für Konten ist der Kontostand = Anker + Transaktionen (Invariante 4). Eine Korrektur
        // muss deshalb selbst als neuer Anker ab `date` gesetzt werden, sonst hat sie keine
        // Wirkung auf den berechneten Saldo (siehe accountBalanceAt in networth.ts).
        await addValueHistoryEntry({
          asset_id: asset.id,
          valued_at: date,
          value_cents: cents,
          source: "anchor",
        });
        await setLastConfirmedBalance(asset.id, cents, date);
      } else {
        await addValueHistoryEntry({
          asset_id: asset.id,
          valued_at: date,
          value_cents: cents,
          source: "manual",
        });
      }
      toast.success("Wert aktualisiert");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`Fehler: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!asset} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Wert aktualisieren – {asset.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="update-value">Betrag</Label>
            <AmountInput
              id="update-value"
              placeholder="0,00"
              value={value}
              onChange={setValue}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting && value.trim()) void handleSubmit();
              }}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="update-value-date">Datum</Label>
            <DateInput id="update-value-date" max={todayIso()} value={date} onChange={setDate} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !value.trim()}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
