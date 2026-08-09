import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepDots } from "@/components/StepDots";
import { cn } from "@/lib/utils";
import { useAssets } from "@/hooks/useAssets";
import { usePersons } from "@/hooks/usePersons";
import { createAsset } from "@/db/repositories/assets";
import { getAnchor } from "@/db/repositories/valueHistory";
import {
  findByFingerprint,
  createImportProfile,
  updateImportProfile,
  listAccountMapForProfile,
  setAccountMapping,
} from "@/db/repositories/importProfiles";
import { computeHeaderFingerprint } from "@/lib/import/fingerprint";
import {
  MAX_IMPORT_FILE_BYTES,
  parseRawGrid,
  detectHeaderRowIndex,
  buildParsedFile,
  findBalanceHint,
  type ParsedFile,
  type RawGridResult,
} from "@/lib/import/parseFile";
import { guessColumnRoles } from "@/lib/import/heuristics";
import { BUILTIN_BANK_PROFILES, EXTRA_FIELD_ROLES, type ColumnMap, type ColumnRole } from "@/lib/import/bankProfiles";
import {
  runImport,
  runMultiAccountImport,
  detectBankAccountLabels,
  detectAmountChanges,
  detectAmountChangesMultiAccount,
  parseRows,
  type RunImportResult,
  type MultiAccountImportResult,
  type AmountChange,
} from "@/lib/import/runImport";
import { parseAmountWithFormat, formatEur, parseAmountToCents } from "@/lib/money";
import { parseDateWithFormat } from "@/lib/dates";
import type { ImportMode } from "@/db/types";
import { toast } from "sonner";

const CORE_ROLE_OPTIONS: { value: ColumnRole | "ignore"; label: string }[] = [
  { value: "date", label: "Datum" },
  { value: "amount", label: "Betrag" },
  { value: "counterparty", label: "Empfänger" },
  { value: "purpose", label: "Verwendungszweck" },
  { value: "external_id", label: "Buchungs-ID" },
];

const EXTRA_ROLE_LABELS: Record<ColumnRole, string> = {
  date: "Buchungsdatum",
  value_date: "Wertstellung / Valuta",
  amount: "Betrag",
  counterparty: "Gegenpartei / Empfänger",
  counterparty_incoming: "Zahlungspflichtiger (Eingang)",
  counterparty_outgoing: "Zahlungsempfänger (Ausgang)",
  purpose: "Verwendungszweck",
  external_id: "Buchungs-ID",
  transaction_type: "Transaktionstyp",
  card_payment_at: "Karteneinsatz-Zeitpunkt",
  cash_withdrawal_at: "Bargeldabhebung-Zeitpunkt",
  recipient_iban: "Empfänger-IBAN",
  recipient_bic: "Empfänger-BIC",
  recipient_account_number: "Empfänger-Kontonummer",
  description: "Beschreibung",
  bank_category: "Bank-Kategorie",
  bank_subcategory: "Bank-Unterkategorie",
  bank_account_label: "Kontoname/Kontonummer (Bank)",
};

type WizardStep = "file" | "headerConfirm" | "mapping" | "accountMapping" | "preview" | "progress" | "result";
const STEP_DOT_INDEX: Record<WizardStep, number> = {
  file: 0,
  headerConfirm: 0,
  mapping: 1,
  accountMapping: 1,
  preview: 2,
  progress: 3,
  result: 4,
};

/** Sentinel-Wert im Konto-Select der Kontokennungs-Zuordnung: "neues Konto anlegen". */
const NEW_ACCOUNT_VALUE = "__new__";
/** Diesen in der Datei gefundenen Kontokennungs-Wert nicht importieren (z. B. nur 2 von 3 Konten). */
const SKIP_ACCOUNT_VALUE = "__skip__";

interface ImportWizardProps {
  open: boolean;
  assetId: number;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
  forceMappingMode?: boolean;
}

export function ImportWizard({ open, assetId, onOpenChange, onCompleted, forceMappingMode }: ImportWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>("file");
  const [selectedAssetId, setSelectedAssetId] = useState(assetId);
  const [file, setFile] = useState<File | null>(null);
  const [rawGrid, setRawGrid] = useState<RawGridResult | null>(null);
  const [headerRowIndex, setHeaderRowIndex] = useState<number | null>(null);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [balanceHint, setBalanceHint] = useState<{ date: string; cents: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [matchedProfileId, setMatchedProfileId] = useState<number | null>(null);
  const [matchedProfileName, setMatchedProfileName] = useState<string | null>(null);
  const [roleByColumn, setRoleByColumn] = useState<Record<number, ColumnRole | "ignore" | "keep">>({});
  const [dataTypeByColumn, setDataTypeByColumn] = useState<Record<number, string>>({});
  const [extractCounterpartyFromPurpose, setExtractCounterpartyFromPurpose] = useState(false);
  /** True, sobald der Nutzer die automatisch vorgeschlagene Spaltenzuordnung manuell geändert hat. */
  const [hasManuallyEditedMapping, setHasManuallyEditedMapping] = useState(false);
  const [selectedAccountLabel, setSelectedAccountLabel] = useState<string | null>(null);

  const [mode, setMode] = useState<ImportMode>("upsert");
  const [balanceInput, setBalanceInput] = useState("");
  const [balanceUnknown, setBalanceUnknown] = useState(false);
  const [isFirstImport, setIsFirstImport] = useState(false);

  const [result, setResult] = useState<RunImportResult | null>(null);
  const [multiResult, setMultiResult] = useState<MultiAccountImportResult | null>(null);

  // --- Mehrkonto-Import (z. B. C24) ---
  const { data: persons } = usePersons();
  const [useMultiAccount, setUseMultiAccount] = useState(false);
  const [accountMapDraft, setAccountMapDraft] = useState<Record<string, number | typeof NEW_ACCOUNT_VALUE | typeof SKIP_ACCOUNT_VALUE>>({});
  const [newAccountNames, setNewAccountNames] = useState<Record<string, string>>({});
  const [savingAccountMapping, setSavingAccountMapping] = useState(false);
  
  // Progress state
  const [pendingAmountChanges, setPendingAmountChanges] = useState<AmountChange[] | null>(null);

  const [progressPhase, setProgressPhase] = useState<"reading" | "saving" | "pipeline" | "finalizing" | null>(null);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  const { data: assets } = useAssets(false);
  const accountAssets = useMemo(() => assets?.filter((a) => a.kind === "account") ?? [], [assets]);

  useEffect(() => {
    if (open) {
      setSelectedAssetId(assetId);
      setStep("file");
      setFile(null);
      setRawGrid(null);
      setHeaderRowIndex(null);
      setParsedFile(null);
      setBalanceHint(null);
      setFileError(null);
      setMatchedProfileId(null);
      setMatchedProfileName(null);
      setRoleByColumn({});
      setDataTypeByColumn({});
      setExtractCounterpartyFromPurpose(false);
      setHasManuallyEditedMapping(false);
      setSelectedAccountLabel(null);
      setMode("upsert");
      setBalanceInput("");
      setBalanceUnknown(false);
      setResult(null);
      setMultiResult(null);
      setUseMultiAccount(false);
      setAccountMapDraft({});
      setNewAccountNames({});
      setProgressPhase(null);
      setProgressDone(0);
      setProgressTotal(0);
    }
  }, [open, assetId]);

  useEffect(() => {
    if (!open) return;
    getAnchor(selectedAssetId).then((a) => setIsFirstImport(!a));
  }, [open, selectedAssetId]);

  useEffect(() => {
    if (balanceHint && !balanceInput) {
      setBalanceInput((balanceHint.cents / 100).toFixed(2).replace(".", ","));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceHint]);

  const roleToIndex = useMemo(() => {
    const map: Partial<Record<ColumnRole, number>> = {};
    for (const [colStr, role] of Object.entries(roleByColumn)) {
      if (role === "ignore" || role === "keep") continue;
      map[role as ColumnRole] = Number(colStr);
    }
    return map;
  }, [roleByColumn]);

  /** Schätzt den Datentyp einer Spalte anhand der ersten 20 Datenzeilen. */
  function autoDetectDataType(colIdx: number, rows: string[][]): string {
    const samples = rows.slice(0, 20).map(r => (r[colIdx] ?? "").trim()).filter(Boolean);
    if (samples.length === 0) return "text";
    const boolVals = new Set(["ja","nein","yes","no","true","false","1","0","wahr","falsch"]);
    if (samples.every(s => boolVals.has(s.toLowerCase()))) return "boolean";
    const dateRe = /^\d{2}\.\d{2}\.\d{4}$|^\d{4}-\d{2}-\d{2}$/;
    const dtRe = /^\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
    if (samples.every(s => dtRe.test(s))) return "datetime";
    if (samples.every(s => dateRe.test(s))) return "date";
    const intRe = /^-?\d+$/;
    const decRe = /^-?\d+([.,]\d+)?$/;
    if (samples.every(s => intRe.test(s))) return "integer";
    if (samples.every(s => decRe.test(s.replace(/\.(?=\d{3})/g, "")))) return "decimal";
    return "text";
  }

  const accountLabels = useMemo(
    () => (parsedFile ? detectBankAccountLabels(parsedFile.rows, roleToIndex) : []),
    [parsedFile, roleToIndex],
  );

  async function applyMappingForHeaders(raw: RawGridResult, hIndex: number) {
    const parsed = buildParsedFile(raw, hIndex);
    setParsedFile(parsed);
    setBalanceHint(findBalanceHint(raw.grid.slice(0, hIndex)));

    const fingerprint = computeHeaderFingerprint(parsed.headers);
    const profile = await findByFingerprint(fingerprint);
    if (profile) {
      const map: ColumnMap = JSON.parse(profile.column_map_json);
      const defaultRole: "keep" | "ignore" = profile.import_all_columns ? "keep" : "ignore";
      const byColumn: Record<number, ColumnRole | "ignore" | "keep"> = {};
      for (let i = 0; i < parsed.headers.length; i++) {
        byColumn[i] = defaultRole;
      }
      for (const [role, headerName] of Object.entries(map)) {
        const idx = parsed.headers.indexOf(headerName as string);
        if (idx >= 0) byColumn[idx] = role as ColumnRole;
      }
      setRoleByColumn(byColumn);
      setMatchedProfileId(profile.id);
      setMatchedProfileName(profile.name);
      const builtinDef = BUILTIN_BANK_PROFILES.find((p) => p.name === profile.name);
      setExtractCounterpartyFromPurpose(!!builtinDef?.extractCounterpartyFromPurpose);
      return true;
    }
    const guessed = guessColumnRoles(parsed.headers, parsed.rows);
    const byColumn: Record<number, ColumnRole | "ignore" | "keep"> = {};
    for (let i = 0; i < parsed.headers.length; i++) {
      byColumn[i] = "keep";
    }
    for (const [role, idx] of Object.entries(guessed)) {
      byColumn[idx as number] = role as ColumnRole;
    }
    setRoleByColumn(byColumn);
    setMatchedProfileId(null);
    setMatchedProfileName(null);
    return false;
  }

  async function handleFileSelected(selected: File) {
    setFileError(null);
    if (!/\.(csv|xlsx)$/i.test(selected.name)) {
      setFileError("Nur .csv oder .xlsx werden unterstützt.");
      return;
    }
    if (selected.size > MAX_IMPORT_FILE_BYTES) {
      setFileError("Datei ist größer als 20 MB.");
      return;
    }
    setFile(selected);
    try {
      const raw = await parseRawGrid(selected);
      setRawGrid(raw);
      const hIndex = detectHeaderRowIndex(raw.grid);
      if (hIndex === null) {
        setHeaderRowIndex(null);
      } else {
        setHeaderRowIndex(hIndex);
        await applyMappingForHeaders(raw, hIndex);
      }
    } catch (e) {
      setFileError(`Datei konnte nicht gelesen werden: ${String(e)}`);
    }
  }

  async function handleContinueFromStep1() {
    if (!rawGrid) return;
    if (headerRowIndex === null) {
      setStep("headerConfirm");
      return;
    }
    setStep("mapping");
  }

  async function handleSelectHeaderRow(index: number) {
    if (!rawGrid) return;
    setHeaderRowIndex(index);
    await applyMappingForHeaders(rawGrid, index);
    setStep("mapping");
  }

  function mappingComplete(): boolean {
    const roles = Object.values(roleByColumn);
    const hasDate = roles.includes("date");
    const hasAmount = roles.includes("amount");
    const hasCounterparty =
      roles.includes("counterparty") ||
      roles.includes("counterparty_incoming") ||
      roles.includes("counterparty_outgoing");
    return hasDate && hasAmount && hasCounterparty;
  }

  function mappingReason(): string | null {
    if (mappingComplete()) return null;
    return "Bitte Datum, Betrag und Empfänger zuordnen.";
  }

  async function handleContinueFromStep2() {
    if (!parsedFile || !mappingComplete()) return;
    const columnMap: ColumnMap = {};
    for (const [colStr, role] of Object.entries(roleByColumn)) {
      if (role === "ignore" || role === "keep") continue;
      columnMap[role as ColumnRole] = parsedFile.headers[Number(colStr)];
    }
    const asset = accountAssets.find((a) => a.id === selectedAssetId);
    let profileId = matchedProfileId;
    if (!profileId) {
      profileId = await createImportProfile({
        name: `${asset?.name ?? "Konto"} – eigenes Format`,
        is_builtin: false,
        header_fingerprint: computeHeaderFingerprint(parsedFile.headers),
        delimiter: parsedFile.detected.delimiter ?? ";",
        encoding: parsedFile.detected.encoding,
        date_format: parsedFile.detected.dateFormat,
        decimal_format: parsedFile.detected.decimalFormat,
        column_map_json: JSON.stringify(columnMap),
      });
      setMatchedProfileId(profileId);
    } else if (forceMappingMode || hasManuallyEditedMapping) {
      // Zuordnung nur persistieren, wenn der Nutzer sie bewusst geöffnet ("Import-Format ändern") oder
      // tatsächlich manuell verändert hat – sonst würde bereits der allererste, ganz normale Import
      // eines Standardprofils (Nutzer klickt nur "Weiter") es sofort als "lokal verändert" einfrieren
      // und künftige Korrekturen am mitgelieferten Standard-Mapping (bankProfiles.ts) nie mehr ankommen.
      await updateImportProfile(profileId, {
        column_map_json: JSON.stringify(columnMap),
        delimiter: parsedFile.detected.delimiter ?? undefined,
        encoding: parsedFile.detected.encoding,
        date_format: parsedFile.detected.dateFormat,
        decimal_format: parsedFile.detected.decimalFormat,
        locally_modified: true,
      });
    }

    if (forceMappingMode) {
      toast.success("Bankprofil aktualisiert");
      onCompleted();
      onOpenChange(false);
      return;
    }

    if (accountLabels.length > 1) {
      setUseMultiAccount(true);
      const existingMap = await listAccountMapForProfile(profileId);
      const draft: Record<string, number | typeof NEW_ACCOUNT_VALUE | typeof SKIP_ACCOUNT_VALUE> = {};
      for (const label of accountLabels) {
        const mapped = existingMap.find((m) => m.source_value === label);
        if (mapped) draft[label] = mapped.asset_id;
      }
      setAccountMapDraft(draft);
      setStep("accountMapping");
      return;
    }

    setUseMultiAccount(false);
    setStep("preview");
  }

  function accountMappingComplete(): boolean {
    const allDecided = accountLabels.every((label) => {
      const value = accountMapDraft[label];
      if (value === undefined) return false;
      if (value === NEW_ACCOUNT_VALUE) return !!newAccountNames[label]?.trim();
      return true;
    });
    // Mindestens ein Konto muss tatsächlich importiert werden (nicht alle übersprungen).
    const hasAtLeastOneMapped = accountLabels.some((label) => {
      const value = accountMapDraft[label];
      return value !== undefined && value !== SKIP_ACCOUNT_VALUE;
    });
    return allDecided && hasAtLeastOneMapped;
  }

  async function handleContinueFromAccountMapping() {
    if (!matchedProfileId || !parsedFile || !accountMappingComplete()) return;
    setSavingAccountMapping(true);
    try {
      const firstPersonId = persons?.[0]?.id;
      for (const label of accountLabels) {
        let value = accountMapDraft[label];
        if (value === SKIP_ACCOUNT_VALUE) continue;
        if (value === NEW_ACCOUNT_VALUE) {
          if (!firstPersonId) throw new Error("Keine Person vorhanden, um ein neues Konto anzulegen.");
          const newAssetId = await createAsset({
            name: newAccountNames[label].trim(),
            kind: "account",
            account_type: "giro",
            owner_ids: [firstPersonId],
          });
          value = newAssetId;
          setAccountMapDraft((prev) => ({ ...prev, [label]: newAssetId }));
        }
        await setAccountMapping(matchedProfileId, label, value);
      }
      if (roleToIndex.bank_account_label !== undefined) {
        await updateImportProfile(matchedProfileId, { account_column_index: roleToIndex.bank_account_label });
      }
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setStep("preview");
    } finally {
      setSavingAccountMapping(false);
    }
  }

  const previewRows = useMemo(() => {
    if (!parsedFile) return [];
    return parsedFile.rows.slice(0, 20).map((row) => {
      try {
        const date =
          roleToIndex.date !== undefined
            ? parseDateWithFormat(row[roleToIndex.date], parsedFile.detected.dateFormat)
            : "–";
        const amount =
          roleToIndex.amount !== undefined
            ? formatEur(parseAmountWithFormat(row[roleToIndex.amount], parsedFile.detected.decimalFormat))
            : "–";
        let counterparty = "–";
        if (roleToIndex.counterparty !== undefined) {
          counterparty = row[roleToIndex.counterparty] || "–";
        } else {
          const inc = roleToIndex.counterparty_incoming !== undefined ? row[roleToIndex.counterparty_incoming] : "";
          const out = roleToIndex.counterparty_outgoing !== undefined ? row[roleToIndex.counterparty_outgoing] : "";
          counterparty = out || inc || "–";
        }
        const purpose = roleToIndex.purpose !== undefined ? row[roleToIndex.purpose] : "";
        return { date, amount, counterparty, purpose };
      } catch {
        return { date: "?", amount: "?", counterparty: "?", purpose: "" };
      }
    });
  }, [parsedFile, roleToIndex]);

  const isMultiAccountImport =
    useMultiAccount && matchedProfileId !== null && roleToIndex.bank_account_label !== undefined;

  function buildAccountMap(): Record<string, number> {
    const accountMap: Record<string, number> = {};
    for (const [label, value] of Object.entries(accountMapDraft)) {
      if (typeof value === "number") accountMap[label] = value;
    }
    return accountMap;
  }

  async function handleRunImport() {
    if (!parsedFile || !file) return;

    // Gestufte Änderungserkennung (Import-Architektur v2, 2.4): bei mode='upsert' vorab prüfen,
    // ob eine bereits importierte Buchung (gleiche external_id) jetzt einen anderen Betrag hat –
    // falls ja, erst rückfragen statt stillschweigend zu übernehmen oder zu verwerfen.
    if (mode === "upsert") {
      const changes =
        isMultiAccountImport && matchedProfileId
          ? await detectAmountChangesMultiAccount({
              filename: file.name,
              profileId: matchedProfileId,
              headers: parsedFile.headers,
              rows: parsedFile.rows,
              roleToIndex,
              roleByColumn,
              dataTypeByColumn,
              extractCounterpartyFromPurpose,
              dateFormat: parsedFile.detected.dateFormat,
              decimalFormat: parsedFile.detected.decimalFormat,
              mode,
              accountColumnIndex: roleToIndex.bank_account_label!,
              accountMap: buildAccountMap(),
            })
          : await detectAmountChanges(
              selectedAssetId,
              parseRows({
                assetId: selectedAssetId,
                filename: file.name,
                profileId: matchedProfileId,
                headers: parsedFile.headers,
                rows: parsedFile.rows,
                roleToIndex,
                roleByColumn,
                dataTypeByColumn,
                extractCounterpartyFromPurpose,
                dateFormat: parsedFile.detected.dateFormat,
                decimalFormat: parsedFile.detected.decimalFormat,
                mode,
                currentBalanceInput: null,
                bankAccountLabelFilter: selectedAccountLabel,
              }).parsed,
            );
      if (changes.length > 0) {
        setPendingAmountChanges(changes);
        return;
      }
    }

    await executeImport(true);
  }

  async function executeImport(applyAmountChanges: boolean) {
    if (!parsedFile || !file) return;
    setPendingAmountChanges(null);
    setStep("progress");
    const cents = balanceUnknown || !balanceInput.trim() ? null : parseAmountToCents(balanceInput);

    if (isMultiAccountImport && matchedProfileId) {
      const multiImportResult = await runMultiAccountImport({
        filename: file.name,
        profileId: matchedProfileId,
        headers: parsedFile.headers,
        rows: parsedFile.rows,
        roleToIndex,
        roleByColumn,
        dataTypeByColumn,
        extractCounterpartyFromPurpose,
        dateFormat: parsedFile.detected.dateFormat,
        decimalFormat: parsedFile.detected.decimalFormat,
        mode,
        accountColumnIndex: roleToIndex.bank_account_label!,
        accountMap: buildAccountMap(),
        applyAmountChanges,
        onProgress: (phase, done, total) => {
          setProgressPhase(phase);
          setProgressDone(done);
          setProgressTotal(total);
        },
      });
      setMultiResult(multiImportResult);
      setStep("result");
      onCompleted();
      return;
    }

    const importResult = await runImport({
      assetId: selectedAssetId,
      filename: file.name,
      profileId: matchedProfileId,
      headers: parsedFile.headers,
      rows: parsedFile.rows,
      roleToIndex,
      roleByColumn,
      dataTypeByColumn,
      extractCounterpartyFromPurpose,
      dateFormat: parsedFile.detected.dateFormat,
      decimalFormat: parsedFile.detected.decimalFormat,
      mode,
      currentBalanceInput: cents,
      bankAccountLabelFilter: selectedAccountLabel,
      applyAmountChanges,
      onProgress: (phase, done, total) => {
        setProgressPhase(phase);
        setProgressDone(done);
        setProgressTotal(total);
      },
    });
    setResult(importResult);
    setStep("result");
    onCompleted();
  }

  function handleClose() {
    onOpenChange(false);
  }

  const rawPreviewLines = rawGrid?.grid.slice(0, 15) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-none flex-col p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>Import</DialogTitle>
          <div className="flex justify-center pt-2">
            <StepDots total={5} current={STEP_DOT_INDEX[step]} variant="current" />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {step === "file" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="import-asset">Zielkonto</Label>
                <Select
                  value={String(selectedAssetId)}
                  onValueChange={(v) => setSelectedAssetId(Number(v))}
                >
                  <SelectTrigger id="import-asset" className="max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountAssets.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className={cn(
                  "flex min-h-[100px] flex-col items-center justify-center gap-2 rounded-standard border-2 border-dashed p-6 text-center text-sm",
                  dragOver ? "border-petrol bg-petrol/5" : "border-border",
                  fileError && "border-brick",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const dropped = e.dataTransfer.files[0];
                  if (dropped) void handleFileSelected(dropped);
                }}
              >
                {file ? (
                  <span className="text-charcoal">
                    {file.name} · {(file.size / 1024).toFixed(0)} KB
                  </span>
                ) : (
                  <span className="text-slate">Datei hierher ziehen oder auswählen (.csv, .xlsx, ≤20 MB)</span>
                )}
                <label>
                  <span className="cursor-pointer text-petrol underline">Datei auswählen</span>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (selected) void handleFileSelected(selected);
                    }}
                  />
                </label>
              </div>
              {fileError && <p className="text-sm text-brick">{fileError}</p>}
              {parsedFile && !fileError && (
                <p className="text-xs text-slate">
                  Erkannt: Encoding {parsedFile.detected.encoding}
                  {parsedFile.detected.delimiter ? `, Trennzeichen "${parsedFile.detected.delimiter}"` : ""}, Dezimalformat{" "}
                  {parsedFile.detected.decimalFormat}, Datumsformat {parsedFile.detected.dateFormat}
                </p>
              )}
            </div>
          )}

          {step === "headerConfirm" && (
            <div className="space-y-3">
              <p className="text-sm text-slate">
                Die Kopfzeile konnte nicht eindeutig erkannt werden. Klicke auf die Zeile, ab der die
                echten Spaltennamen stehen – alles darüber wird verworfen.
              </p>
              <div className="overflow-auto rounded-klein border border-border">
                <table className="w-full text-xs">
                  <tbody>
                    {rawPreviewLines.map((row, i) => (
                      <tr
                        key={i}
                        onClick={() => void handleSelectHeaderRow(i)}
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-accent"
                      >
                        <td className="p-2 text-slate">{i + 1}</td>
                        {row.map((cell, ci) => (
                          <td key={ci} className="p-2">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "mapping" && parsedFile && (
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
                                <SelectLabel>Kernfelder</SelectLabel>
                                {CORE_ROLE_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                              <SelectGroup>
                                <SelectLabel>Weitere Bankfelder</SelectLabel>
                                {EXTRA_FIELD_ROLES.map((role) => (
                                  <SelectItem key={role} value={role}>
                                    {EXTRA_ROLE_LABELS[role]}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                              <SelectItem value="keep">Als Extra-Feld importieren</SelectItem>
                              <SelectItem value="ignore">Ignorieren</SelectItem>
                            </SelectContent>
                          </Select>
                          {(roleByColumn[i] ?? "keep") === "keep" && (
                            <Select
                              value={dataTypeByColumn[i] ?? (parsedFile ? autoDetectDataType(i, parsedFile.rows) : "text")}
                              onValueChange={(v) => setDataTypeByColumn((prev) => ({ ...prev, [i]: v }))}
                            >
                              <SelectTrigger className="mt-1 h-6 w-[170px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="integer">Ganzzahl</SelectItem>
                                <SelectItem value="decimal">Dezimalzahl</SelectItem>
                                <SelectItem value="boolean">Ja/Nein</SelectItem>
                                <SelectItem value="date">Datum</SelectItem>
                                <SelectItem value="datetime">Datum + Uhrzeit</SelectItem>
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
          )}

          {step === "accountMapping" && (
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
                            v === NEW_ACCOUNT_VALUE || v === SKIP_ACCOUNT_VALUE ? v : Number(v),
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
                        <SelectItem value={NEW_ACCOUNT_VALUE}>+ Neues Konto anlegen</SelectItem>
                        <SelectItem value={SKIP_ACCOUNT_VALUE}>Nicht importieren</SelectItem>
                      </SelectContent>
                    </Select>
                    {accountMapDraft[label] === NEW_ACCOUNT_VALUE && (
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
          )}

          {step === "preview" && parsedFile && (
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
                      <th className="p-2 text-left">Datum</th>
                      <th className="p-2 text-left">Empfänger</th>
                      <th className="p-2 text-left">Zweck</th>
                      <th className="p-2 text-right">Betrag</th>
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
                  <p className="text-sm font-medium text-charcoal">Aufschlüsselung je Konto</p>
                  {accountLabels.map((label) => {
                    const count = parsedFile.rows.filter(
                      (row) => roleToIndex.bank_account_label !== undefined && (row[roleToIndex.bank_account_label] ?? "").trim() === label,
                    ).length;
                    const value = accountMapDraft[label];
                    const assetName =
                      typeof value === "number"
                        ? accountAssets.find((a) => a.id === value)?.name ?? "?"
                        : value === SKIP_ACCOUNT_VALUE
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
                  <div className="font-medium">Aktualisieren (empfohlen)</div>
                  <div className="mt-1 text-xs text-slate">Neue Buchungen ergänzen, Duplikate überspringen.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("replace_all")}
                  className={cn(
                    "rounded-standard border p-3 text-left text-sm",
                    mode === "replace_all" ? "border-petrol bg-petrol/5" : "border-border",
                  )}
                >
                  <div className="font-medium">Komplett neu laden</div>
                  <div className="mt-1 text-xs text-slate">Importierte Zeilen ersetzen, manuelle bleiben.</div>
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
          )}

          {step === "progress" && (
            <div className="flex flex-col items-center gap-3 py-8">
              {parsedFile && (
                <ul className="w-full max-w-sm space-y-1.5 self-start text-sm text-charcoal">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-sage" />
                    <span>
                      Datei erkannt · Encoding {parsedFile.detected.encoding}
                      {parsedFile.detected.delimiter ? `, Trennzeichen "${parsedFile.detected.delimiter}"` : ""}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-sage" />
                    <span>{parsedFile.rows.length} Buchungen gefunden</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-sage" />
                    <span>
                      {matchedProfileName
                        ? `Passendes Profil erkannt: "${matchedProfileName}"`
                        : "Neues Bank-Template angelegt"}
                    </span>
                  </li>
                  {useMultiAccount && (
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-sage" />
                      <span>{Object.keys(accountMapDraft).length} Konten erkannt</span>
                    </li>
                  )}
                </ul>
              )}
              <div className="h-2 w-full overflow-hidden rounded-pill bg-accent">
                <div 
                  className="h-full bg-petrol transition-all duration-300"
                  style={{ width: `${progressTotal > 0 ? (progressDone / progressTotal) * 100 : 0}%` }}
                />
              </div>
              <p className="text-sm text-slate">
                {progressPhase === "reading" && "Datei wird gelesen…"}
                {progressPhase === "saving" && `${progressDone} von ${progressTotal} Zeilen werden gespeichert…`}
                {progressPhase === "pipeline" && "Kategorisierung, Vertrags- und Transfer-Erkennung läuft…"}
                {progressPhase === "finalizing" && "Import wird abgeschlossen…"}
                {!progressPhase && "Lädt…"}
              </p>
            </div>
          )}

          {step === "result" && result && (
            <div className="space-y-3 text-sm">
              {result.status === "failed" ? (
                <div className="rounded-klein bg-brick/10 p-3 text-brick">
                  Import fehlgeschlagen: {result.errorMessage}
                  <br />
                  Der Altbestand ist unverändert.
                </div>
              ) : (
                <ul className="space-y-1">
                  <li>Gelesene Zeilen: {result.rowsRead}</li>
                  <li>Neu: {result.rowsNew}</li>
                  <li>Aktualisiert: {result.rowsUpdated}</li>
                  <li>Übersprungene Duplikate: {result.rowsSkipped}</li>
                  <li>
                    Automatisch kategorisiert: {result.rowsAutoCategorized} von {result.rowsRead}
                  </li>
                  {result.transfersFound > 0 && <li>Erkannte Transfers: {result.transfersFound}</li>}
                  {result.rowsIgnoredOtherAccount > 0 && (
                    <li>{result.rowsIgnoredOtherAccount} Zeilen anderer Konten ignoriert.</li>
                  )}
                  {result.balanceUnconfirmed && (
                    <li className="text-gold">Saldo unbestätigt – nachholbar auf der Vermögen-Seite.</li>
                  )}
                  {result.balanceMismatchCents !== null && (
                    <li className="text-brick">Saldo-Abweichung: {formatEur(result.balanceMismatchCents)}</li>
                  )}
                  {result.lostMetadataCount > 0 && (
                    <li className="text-gold">
                      {result.lostMetadataCount} Buchungen mit Zusatzdaten konnten nicht übertragen werden.
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          {step === "result" && multiResult && (
            <div className="space-y-3 text-sm">
              {multiResult.status === "failed" ? (
                <div className="rounded-klein bg-brick/10 p-3 text-brick">
                  Import fehlgeschlagen: {multiResult.errorMessage}
                  <br />
                  Der Altbestand ist unverändert.
                </div>
              ) : (
                <ul className="space-y-2">
                  {multiResult.perAccount.map((acc) => (
                    <li key={acc.assetId} className="rounded-klein border border-border p-2">
                      <p className="font-medium text-charcoal">{accountAssets.find((a) => a.id === acc.assetId)?.name ?? acc.label}</p>
                      <p className="text-xs text-slate">
                        {acc.rowsNew} neu · {acc.rowsUpdated} aktualisiert · {acc.rowsSkipped} übersprungen ·{" "}
                        {acc.rowsAutoCategorized} automatisch kategorisiert
                        {acc.transfersFound > 0 ? ` · ${acc.transfersFound} Transfers erkannt` : ""}
                      </p>
                      {acc.balanceUnconfirmed && (
                        <p className="text-xs text-gold">Saldo unbestätigt – nachholbar auf der Vermögen-Seite.</p>
                      )}
                    </li>
                  ))}
                  {multiResult.rowsIgnoredUnmapped > 0 && (
                    <li className="text-xs text-gold">
                      {multiResult.rowsIgnoredUnmapped} Zeilen ohne zuordenbare Kontokennung ignoriert.
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4">
          {step === "file" && (
            <>
              {!rawGrid && <span className="text-xs text-slate">Bitte zuerst eine Datei auswählen.</span>}
              <Button onClick={() => void handleContinueFromStep1()} disabled={!rawGrid}>
                Weiter
              </Button>
            </>
          )}
          {step === "mapping" && (
            <>
              {mappingReason() && <span className="text-xs text-brick">{mappingReason()}</span>}
              <Button onClick={() => void handleContinueFromStep2()} disabled={!!mappingReason()}>
                Weiter
              </Button>
            </>
          )}
          {step === "accountMapping" && (
            <>
              {!accountMappingComplete() && (
                <span className="text-xs text-brick">Bitte jeden Wert einem Konto zuordnen.</span>
              )}
              <Button
                onClick={() => void handleContinueFromAccountMapping()}
                disabled={!accountMappingComplete() || savingAccountMapping}
              >
                Weiter
              </Button>
            </>
          )}
          {step === "preview" && (
            <Button
              onClick={() => void handleRunImport()}
              disabled={!useMultiAccount && isFirstImport && !balanceUnknown && !balanceInput.trim()}
            >
              Import starten
            </Button>
          )}
          {step === "result" && (result?.status === "failed" || multiResult?.status === "failed") && (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Schließen
              </Button>
              <Button onClick={() => setStep("file")}>Andere Datei wählen</Button>
            </>
          )}
          {step === "result" && (result?.status === "success" || multiResult?.status === "success") && (
            <Button onClick={handleClose}>Fertig</Button>
          )}
        </div>
      </DialogContent>

      <Dialog open={!!pendingAmountChanges} onOpenChange={(open) => !open && setPendingAmountChanges(null)}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Beträge haben sich geändert</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate">
            {pendingAmountChanges?.length}{" "}
            {pendingAmountChanges?.length === 1 ? "Buchung hat" : "Buchungen haben"} sich seit dem letzten Import im
            Betrag geändert. Verwendungszweck/Empfänger werden in jedem Fall aktualisiert – wie soll mit dem
            geänderten Betrag umgegangen werden?
          </p>
          <ul className="max-h-[240px] space-y-1.5 overflow-y-auto rounded-klein border border-border p-2 text-sm">
            {pendingAmountChanges?.map((c) => (
              <li key={c.external_id} className="flex items-center justify-between gap-3">
                <span className="truncate text-charcoal">{c.counterparty}</span>
                <span className="num shrink-0 text-slate">
                  {formatEur(c.oldAmountCents)} → {formatEur(c.newAmountCents)}
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => void executeImport(false)}>
              Alten Betrag beibehalten
            </Button>
            <Button onClick={() => void executeImport(true)}>Neuen Betrag übernehmen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
