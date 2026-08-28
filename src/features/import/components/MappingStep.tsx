import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ParsedFile, RawGridResult } from "@/lib/import/parseFile";
import { EXTRA_FIELD_ROLES, type ColumnRole } from "@/lib/import/bankProfiles";

interface MappingStepProps {
  parsedFile: ParsedFile;
  rawGrid: RawGridResult | null;
  headerRowIndex: number | null;
  matchedProfileName: string | null;
  roleByColumn: Record<number, ColumnRole | "ignore" | "keep">;
  setRoleByColumn: (fn: (prev: Record<number, ColumnRole | "ignore" | "keep">) => Record<number, ColumnRole | "ignore" | "keep">) => void;
  dataTypeByColumn: Record<number, string>;
  setDataTypeByColumn: (fn: (prev: Record<number, string>) => Record<number, string>) => void;
  setHasManuallyEditedMapping: (v: boolean) => void;
  autoDetectDataType: (colIndex: number, rows: string[][]) => string;
  applyMappingForHeaders: (raw: RawGridResult, headerIdx: number) => Promise<void | boolean>;
  accountLabels: string[];
  mappingComplete: () => boolean;
  coreRoleOptions: { value: ColumnRole | "ignore"; label: string }[];
  extraRoleLabels: Record<ColumnRole, string>;
}

export function MappingStep({
  parsedFile,
  rawGrid,
  headerRowIndex,
  matchedProfileName,
  roleByColumn,
  setRoleByColumn,
  dataTypeByColumn,
  setDataTypeByColumn,
  setHasManuallyEditedMapping,
  autoDetectDataType,
  applyMappingForHeaders,
  accountLabels,
  mappingComplete,
  coreRoleOptions,
  extraRoleLabels,
}: MappingStepProps) {
  const { t } = useTranslation(["app"]);

  return (
    <div className="space-y-3">
      {matchedProfileName ? (
        <div className="flex items-center justify-between rounded-klein bg-petrol/10 p-3 text-xs text-petrol">
          <span>
            Bank-Template <strong>{matchedProfileName}</strong> wurde automatisch erkannt. Alle Spalten wurden vorausgewählt – du kannst die Zuordnungen unten anpassen oder vom Template abweichen.
          </span>
          {rawGrid && headerRowIndex !== null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void applyMappingForHeaders(rawGrid, headerRowIndex)}
            >
              Template zurücksetzen
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate">
          Spaltenzuordnung: Alle Spalten werden standardmäßig importiert. Du kannst Rollen zuweisen oder einzelne Spalten anpassen/ignorieren.
        </p>
      )}
      <div className="relative overflow-auto rounded-klein border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-accent">
              {parsedFile.headers.map((h, i) => (
                <th
                  key={i}
                  className="w-[180px] min-w-[180px] p-2 text-left font-medium"
                >
                  <div className="mb-1 whitespace-nowrap">{h}</div>
                  <Select
                    value={roleByColumn[i] ?? "keep"}
                    onValueChange={(v) => {
                      setRoleByColumn((prev) => ({ ...prev, [i]: v as ColumnRole | "ignore" | "keep" }));
                      setHasManuallyEditedMapping(true);
                      if (v === "keep" && !dataTypeByColumn[i] && parsedFile) {
                        setDataTypeByColumn((prev) => ({ ...prev, [i]: autoDetectDataType(i, parsedFile.rows) }));
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 w-[170px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>{t("import.mapping.coreRoles")}</SelectLabel>
                        {coreRoleOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>{t("import.mapping.bankRoles")}</SelectLabel>
                        {EXTRA_FIELD_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {extraRoleLabels[role]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectItem value="keep">{t("import.mapping.extraRoles")}</SelectItem>
                      <SelectItem value="ignore">{t("import.mapping.ignore")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {(roleByColumn[i] ?? "keep") === "keep" && (
                    <Select
                      value={dataTypeByColumn[i] ?? autoDetectDataType(i, parsedFile.rows)}
                      onValueChange={(v) => setDataTypeByColumn((prev) => ({ ...prev, [i]: v }))}
                    >
                      <SelectTrigger className="mt-1 h-6 w-[170px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{t("import.mapping.type.text")}</SelectItem>
                        <SelectItem value="integer">{t("import.mapping.type.integer")}</SelectItem>
                        <SelectItem value="decimal">{t("import.mapping.type.decimal")}</SelectItem>
                        <SelectItem value="boolean">{t("import.mapping.type.boolean")}</SelectItem>
                        <SelectItem value="date">{t("import.roles.date")}</SelectItem>
                        <SelectItem value="datetime">{t("import.mapping.type.datetime")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsedFile.rows.slice(0, 20).map((row, ri) => (
              <tr key={ri} className="border-b border-border last:border-0">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="w-[180px] min-w-[180px] p-2 text-slate"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mappingComplete() && accountLabels.length > 1 && (
        <div className="space-y-1.5 rounded-klein bg-accent p-3">
          <p className="text-sm text-charcoal">
            Diese Datei enthält {accountLabels.length} Konten: {accountLabels.join(", ")}. Im nächsten Schritt
            ordnest du jedes einmalig einem Klarwert-Konto zu – danach werden alle in einem Durchlauf
            importiert.
          </p>
        </div>
      )}
    </div>
  );
}
