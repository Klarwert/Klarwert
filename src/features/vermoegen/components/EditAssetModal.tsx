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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePersons } from "@/hooks/usePersons";
import { useSparzwecke } from "@/hooks/useSparzwecke";
import { updateAsset, type AssetWithOwners } from "@/db/repositories/assets";
import type { AccountType, ValuableType } from "@/db/types";
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

interface EditAssetModalProps {
  asset: AssetWithOwners | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditAssetModal({ asset, onOpenChange, onSaved }: EditAssetModalProps) {
  const [name, setName] = useState("");
  const [iban, setIban] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("giro");
  const [valuableType, setValuableType] = useState<ValuableType>("sonstiges");
  const [ownerIds, setOwnerIds] = useState<number[]>([]);
  const [sparzweckId, setSparzweckId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: persons } = usePersons();
  const { data: sparzwecke } = useSparzwecke();

  useEffect(() => {
    if (asset) {
      setName(asset.name);
      setIban(asset.iban ?? "");
      if (asset.account_type) setAccountType(asset.account_type);
      if (asset.valuable_type) setValuableType(asset.valuable_type);
      setOwnerIds(asset.owner_ids);
      setSparzweckId(asset.default_sparzweck_id);
    }
  }, [asset]);

  if (!asset) return null;

  const showSparzweck =
    (asset.kind === "account" && (accountType === "tagesgeld" || accountType === "depot")) ||
    (asset.kind === "valuable" && valuableType === "bausparvertrag");

  async function handleSubmit() {
    if (!asset || !name.trim()) return;
    setSubmitting(true);
    try {
      await updateAsset(asset.id, {
        name: name.trim(),
        account_type: asset.kind === "account" ? accountType : undefined,
        default_sparzweck_id: showSparzweck ? sparzweckId : null,
        iban: asset.kind === "account" ? iban : undefined,
        owner_ids: ownerIds,
      });
      toast.success("Änderungen gespeichert");
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
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Konto bearbeiten</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="edit-asset-name">Name</Label>
            <Input
              id="edit-asset-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {asset.kind === "account" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-asset-iban">IBAN (optional)</Label>
              <Input
                id="edit-asset-iban"
                value={iban}
                placeholder="DE12 3456 7890 1234 5678 90"
                onChange={(e) => setIban(e.target.value)}
              />
              <p className="text-xs text-slate">
                Grundlage für die sichere Transfer-/Sparen-Erkennung, auch ohne Gegenbuchung.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="edit-asset-type">Typ</Label>
            {asset.kind === "account" ? (
              <Select value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
                <SelectTrigger id="edit-asset-type">
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
                <SelectTrigger id="edit-asset-type">
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
            {asset.kind === "account" && (accountType === "tagesgeld" || accountType === "depot") && (
              <p className="text-xs text-slate">
                Tagesgeld/Depot gelten als Sparkonto: Überweisungen von einem deiner anderen Konten
                hierher zählen automatisch als Sparen, eine Entnahme zurück verringert den Sparstand
                wieder.
              </p>
            )}
          </div>

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

          {showSparzweck && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-asset-sparzweck">Standard-Sparzweck</Label>
              <Select
                value={sparzweckId ? String(sparzweckId) : "none"}
                onValueChange={(v) => setSparzweckId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger id="edit-asset-sparzweck">
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
