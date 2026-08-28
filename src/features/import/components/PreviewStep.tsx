import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ParsedFile } from "@/lib/import/parseFile";
import type { ImportMode, Asset } from "@/db/types";

interface PreviewStepProps {
  matchedProfileName: string | null;
  roleByColumn: Record<number, any>;
  setStep: (step: any) => void;
  previewRows: { date: string; counterparty: string; purpose: string; amount: string }[];
  useMultiAccount: boolean;
  accountLabels: string[];
  parsedFile: ParsedFile;
  roleToIndex: Record<string, number>;
  accountMapDraft: Record<string, number | "__new__" | "__skip__">;
  accountAssets: Asset[];
  mode: ImportMode;
  setMode: (mode: ImportMode) => void;
  isFirstImport: boolean;
  balanceInput: string;
  setBalanceInput: (v: string) => void;
  balanceUnknown: boolean;
  setBalanceUnknown: (fn: (v: boolean) => boolean) => void;
  balanceHint: { date: string; cents: number } | null;
}

export function PreviewStep({
  matchedProfileName,
  roleByColumn,
  setStep,
  previewRows,
  useMultiAccount,
  accountLabels,
  parsedFile,
  roleToIndex,
  accountMapDraft,
  accountAssets,
  mode,
  setMode,
  isFirstImport,
  balanceInput,
  setBalanceInput,
  balanceUnknown,
  setBalanceUnknown,
  balanceHint,
}: PreviewStepProps) {
  const { t } = useTranslation(["app"]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {matchedProfileName ? (
          <p className="text-sm text-sage">Erkanntes Template: {matchedProfileName}</p>
        ) : (
          <p className="text-sm text-slate">Benutzerdefinierte Spaltenzuordnung ({Object.keys(roleByColumn).length} Spalten)</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-petrol underline"
          onClick={() => setStep("mapping")}
        >
          Spaltenzuordnung anpassen / Vom Template abweichen
        </Button>
      </div>
      <div className="max-h-[220px] overflow-auto rounded-klein border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-accent">
              <th className="p-2 text-left">{t("import.roles.date")}</th>
              <th className="p-2 text-left">{t("import.roles.counterparty")}</th>
              <th className="p-2 text-left">{t("import.roles.purpose")}</th>
              <th className="p-2 text-right">{t("import.roles.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="p-2">{r.date}</td>
                <td className="p-2">{r.counterparty}</td>
                <td className="p-2 text-slate">{r.purpose}</td>
                <td className="num p-2 text-right">{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {useMultiAccount && (
        <div className="space-y-1 rounded-klein bg-accent p-3">
          <p className="text-sm font-medium text-charcoal">{t("import.preview.summary")}</p>
          {accountLabels.map((label) => {
            const count = parsedFile.rows.filter(
              (row) => roleToIndex.bank_account_label !== undefined && (row[roleToIndex.bank_account_label] ?? "").trim() === label,
            ).length;
            const value = accountMapDraft[label];
            const assetName =
              typeof value === "number"
                ? accountAssets.find((a) => a.id === value)?.name ?? "?"
                : value === "__skip__"
                  ? "wird übersprungen"
                  : "?";
            return (
              <p key={label} className="text-xs text-slate">
                {label} → {assetName}: {count} Zeilen
              </p>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMode("upsert")}
          className={cn(
            "rounded-standard border p-3 text-left text-sm",
            mode === "upsert" ? "border-petrol bg-petrol/5" : "border-border",
          )}
        >
          <div className="font-medium">{t("import.mode.upsert")}</div>
          <div className="mt-1 text-xs text-slate">{t("import.mode.upsertDesc")}</div>
        </button>
        <button
          type="button"
          onClick={() => setMode("replace_all")}
          className={cn(
            "rounded-standard border p-3 text-left text-sm",
            mode === "replace_all" ? "border-petrol bg-petrol/5" : "border-border",
          )}
        >
          <div className="font-medium">{t("import.mode.replace")}</div>
          <div className="mt-1 text-xs text-slate">{t("import.mode.replaceDesc")}</div>
        </button>
      </div>

      {useMultiAccount ? (
        <p className="text-xs text-slate">
          Kontostände werden bei Mehrkonto-Dateien nicht hier abgefragt – bitte nach dem Import je Konto auf
          der Vermögen-Seite bestätigen.
        </p>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="current-balance">
            Aktueller Kontostand laut Banking{isFirstImport ? " (Pflicht)" : " (optional)"}
          </Label>
          <Input
            id="current-balance"
            inputMode="decimal"
            placeholder="0,00"
            value={balanceInput}
            disabled={balanceUnknown}
            onChange={(e) => setBalanceInput(e.target.value)}
          />
          {balanceHint && (
            <p className="text-xs text-sage">
              Aus Datei übernommen ({balanceHint.date}) – bitte prüfen.
            </p>
          )}
          {isFirstImport && (
            <button
              type="button"
              className="text-xs text-petrol underline"
              onClick={() => setBalanceUnknown((v) => !v)}
            >
              {balanceUnknown ? "Doch angeben" : "Weiß ich gerade nicht"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
