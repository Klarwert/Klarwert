import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Asset } from "@/db/types";

interface AccountMappingStepProps {
  accountLabels: string[];
  accountMapDraft: Record<string, number | "__new__" | "__skip__">;
  setAccountMapDraft: (fn: (prev: Record<string, number | "__new__" | "__skip__">) => Record<string, number | "__new__" | "__skip__">) => void;
  accountAssets: Asset[];
  newAccountNames: Record<string, string>;
  setNewAccountNames: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
}

export function AccountMappingStep({
  accountLabels,
  accountMapDraft,
  setAccountMapDraft,
  accountAssets,
  newAccountNames,
  setNewAccountNames,
}: AccountMappingStepProps) {
  const { t } = useTranslation(["app"]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">
        Ordne jeden in der Datei gefundenen Kontokennungs-Wert einem bestehenden oder neu anzulegenden
        Klarwert-Konto zu. Beim nächsten Import mit diesem Profil entfällt dieser Schritt.
      </p>
      <div className="space-y-3">
        {accountLabels.map((label) => (
          <div key={label} className="space-y-1.5 rounded-klein border border-border p-3">
            <p className="text-sm font-medium text-charcoal">{label}</p>
            <Select
              value={
                accountMapDraft[label] === undefined ? undefined : String(accountMapDraft[label])
              }
              onValueChange={(v) =>
                setAccountMapDraft((prev) => ({
                  ...prev,
                  [label]:
                    v === "__new__" || v === "__skip__" ? v : Number(v),
                }))
              }
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Konto wählen" />
              </SelectTrigger>
              <SelectContent>
                {accountAssets.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
                <SelectItem value="__new__">{t("import.accountMapping.newAccount")}</SelectItem>
                <SelectItem value="__skip__">{t("import.accountMapping.ignore")}</SelectItem>
              </SelectContent>
            </Select>
            {accountMapDraft[label] === "__new__" && (
              <Input
                placeholder="Name des neuen Kontos"
                value={newAccountNames[label] ?? ""}
                onChange={(e) => setNewAccountNames((prev) => ({ ...prev, [label]: e.target.value }))}
                className="max-w-sm"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
