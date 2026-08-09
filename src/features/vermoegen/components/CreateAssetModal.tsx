import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePersons } from "@/hooks/usePersons";
import { useSparzwecke } from "@/hooks/useSparzwecke";
import { createAsset } from "@/db/repositories/assets";
import { addValueHistoryEntry } from "@/db/repositories/valueHistory";
import { parseAmountToCents } from "@/lib/money";
import { todayIso } from "@/lib/dates";
import type { AccountType, AssetKind, ValuableType } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "giro", label: "Girokonto" },
  { value: "tagesgeld", label: "Tagesgeld" },
  { value: "kreditkarte", label: "Kreditkarte" },
  { value: "depot", label: "Depot" },
  { value: "darlehen", label: "Darlehen" },
];

const VALUABLE_TYPES: { value: ValuableType; label: string }[] = [
  { value: "bausparvertrag", label: "Bausparvertrag" },
  { value: "bargeld", label: "Bargeld" },
  { value: "sonstiges", label: "Sonstiges" },
];

interface CreateAssetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (assetId: number, kind: AssetKind) => void;
  /**
   * Vorbefüllung für den Auto-Konto-Vorschlag (wiederholt auffällige eigene IBAN + Namensabgleich,
   * siehe Bugfix-Runde 3, Punkt 4): IBAN kommt aus echten Bankdaten und ist deshalb ausgegraut/nicht
   * editierbar – der Nutzer bestätigt oder verwirft den Vorschlag, tippt die IBAN nicht selbst ab.
   */
  initial?: { name?: string; iban?: string; ibanLocked?: boolean };
}

export function CreateAssetModal({ open, onOpenChange, onCreated, initial }: CreateAssetModalProps) {
  const [kind, setKind] = useState<AssetKind>("account");
  const [accountType, setAccountType] = useState<AccountType>("giro");
  const [valuableType, setValuableType] = useState<ValuableType>("sonstiges");
  const [name, setName] = useState(initial?.name ?? "");
  const [iban, setIban] = useState(initial?.iban ?? "");
  const [ownerIds, setOwnerIds] = useState<number[]>([]);
  const [sparzweckId, setSparzweckId] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [valueDate, setValueDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);

  const { data: persons } = usePersons();
  const { data: sparzwecke } = useSparzwecke();

  const requiresOwnerChoice = (persons?.length ?? 0) > 1;

  useEffect(() => {
    if (persons && persons.length === 1) {
      setOwnerIds([persons[0].id]);
    }
  }, [persons]);

  useEffect(() => {
    if (open && initial) {
      setKind("account");
      setName(initial.name ?? "");
      setIban(initial.iban ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const showSparzweck =
    (kind === "account" && (accountType === "tagesgeld" || accountType === "depot")) ||
    (kind === "valuable" && valuableType === "bausparvertrag");

  function reset() {
    setKind("account");
    setAccountType("giro");
    setValuableType("sonstiges");
    setName("");
    setIban("");
    setOwnerIds([]);
    setSparzweckId(null);
    setValue("");
    setValueDate(todayIso());
  }

  async function handleSubmit() {
    if (!name.trim()) return;
    if (kind === "valuable" && !value.trim()) return;
    setSubmitting(true);
    try {
      const assetId = await createAsset({
        name: name.trim(),
        kind,
        account_type: kind === "account" ? accountType : null,
        valuable_type: kind === "valuable" ? valuableType : null,
        default_sparzweck_id: showSparzweck ? sparzweckId : null,
        iban: kind === "account" ? iban : null,
        owner_ids: ownerIds,
      });

      if (kind === "valuable") {
        const cents = parseAmountToCents(value);
        await addValueHistoryEntry({
          asset_id: assetId,
          valued_at: valueDate,
          value_cents: cents,
          source: "manual",
        });
      }

      toast.success(kind === "valuable" ? "Vermögenswert angelegt" : "Konto angelegt");
      onCreated(assetId, kind);
      reset();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`Fehler: ${String(e)}`);
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
          <DialogTitle>Konto / Vermögenswert anlegen</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setKind("account");
                setAccountType("giro");
              }}
              className={cn(
                "rounded-standard border p-4 text-left transition-colors",
                kind === "account"
                  ? "border-petrol bg-petrol/5"
                  : "border-border hover:bg-accent",
              )}
            >
              <div className="font-medium text-charcoal">Mit Import</div>
              <div className="mt-1 text-xs text-slate">
                Girokonto, Tagesgeld, Kreditkarte, Depot, Darlehen
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setKind("valuable");
                setValuableType("sonstiges");
              }}
              className={cn(
                "rounded-standard border p-4 text-left transition-colors",
                kind === "valuable"
                  ? "border-petrol bg-petrol/5"
                  : "border-border hover:bg-accent",
              )}
            >
              <div className="font-medium text-charcoal">Nur Wertstand</div>
              <div className="mt-1 text-xs text-slate">
                Bausparvertrag, Bargeld, Sonstiges
              </div>
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-type">Typ</Label>
            {kind === "account" ? (
              <Select value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
                <SelectTrigger id="asset-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={valuableType} onValueChange={(v) => setValuableType(v as ValuableType)}>
                <SelectTrigger id="asset-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALUABLE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {kind === "account" && (accountType === "tagesgeld" || accountType === "depot") && (
              <p className="text-xs text-slate">
                Tagesgeld/Depot gelten als Sparkonto: Überweisungen von einem deiner anderen Konten
                hierher zählen automatisch als Sparen, eine Entnahme zurück verringert den Sparstand
                wieder.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-name">Name</Label>
            <Input
              id="asset-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {kind === "account" && (
            <div className="space-y-1.5">
              <Label htmlFor="asset-iban">IBAN (optional)</Label>
              <Input
                id="asset-iban"
                value={iban}
                placeholder="DE12 3456 7890 1234 5678 90"
                onChange={(e) => setIban(e.target.value)}
                disabled={initial?.ibanLocked}
                className={initial?.ibanLocked ? "bg-accent text-slate" : undefined}
              />
              <p className="text-xs text-slate">
                {initial?.ibanLocked
                  ? "Aus deinen Buchungen übernommen, deshalb nicht editierbar."
                  : "Grundlage für die sichere Transfer-/Sparen-Erkennung, auch ohne Gegenbuchung."}
              </p>
            </div>
          )}

          {requiresOwnerChoice && (
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <div className="flex flex-wrap gap-3">
                {persons?.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={ownerIds.includes(p.id)}
                      onCheckedChange={(checked) =>
                        setOwnerIds((prev) =>
                          checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                        )
                      }
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {showSparzweck && (
            <div className="space-y-1.5">
              <Label htmlFor="asset-sparzweck">Standard-Sparzweck (optional)</Label>
              <Select
                value={sparzweckId ? String(sparzweckId) : "none"}
                onValueChange={(v) => setSparzweckId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger id="asset-sparzweck">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Standard-Sparzweck</SelectItem>
                  {sparzwecke?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "valuable" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-value">Wert</Label>
                <AmountInput
                  id="asset-value"
                  placeholder="0,00"
                  value={value}
                  onChange={setValue}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !submitting && name.trim() && value.trim()) void handleSubmit();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-value-date">Datum</Label>
                <DateInput id="asset-value-date" max={todayIso()} value={valueDate} onChange={setValueDate} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || (requiresOwnerChoice && ownerIds.length === 0)}
          >
            {kind === "account" ? "Weiter zum Import" : "Anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
