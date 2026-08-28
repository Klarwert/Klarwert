import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StepDots } from "@/components/StepDots";
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
import { BUILTIN_BANK_PROFILES, type ColumnMap, type ColumnRole } from "@/lib/import/bankProfiles";
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
import { FileSelectionStep } from "./components/FileSelectionStep";
import { HeaderConfirmStep } from "./components/HeaderConfirmStep";
import { MappingStep } from "./components/MappingStep";
import { AccountMappingStep } from "./components/AccountMappingStep";
import { PreviewStep } from "./components/PreviewStep";
import { ProgressStep } from "./components/ProgressStep";
import { ResultStep } from "./components/ResultStep";

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
  const { t } = useTranslation(["app"]);

  const CORE_ROLE_OPTIONS: { value: ColumnRole | "ignore"; label: string }[] = [
    { value: "date", label: t("import.roles.date") },
    { value: "amount", label: t("import.roles.amount") },
    { value: "counterparty", label: t("import.roles.counterparty") },
    { value: "purpose", label: t("import.roles.purpose") },
    { value: "external_id", label: t("import.roles.external_id") },
  ];

  const EXTRA_ROLE_LABELS: Record<ColumnRole, string> = {
    date: t("import.roles.date"),
    value_date: t("import.roles.value_date"),
    amount: t("import.roles.amount"),
    counterparty: t("import.roles.counterparty"),
    counterparty_incoming: t("import.roles.counterparty_incoming"),
    counterparty_outgoing: t("import.roles.counterparty_outgoing"),
    purpose: t("import.roles.purpose"),
    external_id: t("import.roles.external_id"),
    transaction_type: t("import.roles.transaction_type"),
    card_payment_at: t("import.roles.card_payment_at"),
    cash_withdrawal_at: t("import.roles.cash_withdrawal_at"),
    recipient_iban: t("import.roles.recipient_iban"),
    recipient_bic: t("import.roles.recipient_bic"),
    recipient_account_number: t("import.roles.recipient_account_number"),
    description: t("import.roles.description"),
    bank_category: t("import.roles.bank_category"),
    bank_subcategory: t("import.roles.bank_subcategory"),
    bank_account_label: t("import.roles.bank_account_label"),
  };

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
    void getAnchor(selectedAssetId).then((a) => setIsFirstImport(!a));
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
      map[role] = Number(colStr);
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
    if (profile && profile.column_map_json) {
      const map: ColumnMap = profile.column_map_json;
      const defaultRole: "keep" | "ignore" = profile.import_all_columns ? "keep" : "ignore";
      const byColumn: Record<number, ColumnRole | "ignore" | "keep"> = {};
      for (let i = 0; i < parsed.headers.length; i++) {
        byColumn[i] = defaultRole;
      }
      for (const [role, headerName] of Object.entries(map)) {
        const idx = parsed.headers.indexOf(headerName);
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
      byColumn[idx] = role as ColumnRole;
    }
    setRoleByColumn(byColumn);
    setMatchedProfileId(null);
    setMatchedProfileName(null);
    return false;
  }

  async function handleFileSelected(selected: File) {
    setFileError(null);
    if (!/\.(csv|xlsx)$/i.test(selected.name)) {
      setFileError(t("import.file.errorFormat"));
      return;
    }
    if (selected.size > MAX_IMPORT_FILE_BYTES) {
      setFileError(t("import.file.errorSize"));
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

  function handleContinueFromStep1() {
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
    return t("import.mapping.errorCore");
  }

  async function handleContinueFromStep2() {
    if (!parsedFile || !mappingComplete()) return;
    const columnMap: ColumnMap = {};
    for (const [colStr, role] of Object.entries(roleByColumn)) {
      if (role === "ignore" || role === "keep") continue;
      columnMap[role] = parsedFile.headers[Number(colStr)];
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
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
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
          <DialogTitle>{t("import.title")}</DialogTitle>
          <div className="flex justify-center pt-2">
            <StepDots total={5} current={STEP_DOT_INDEX[step]} variant="current" />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {step === "file" && (
            <FileSelectionStep
              accountAssets={accountAssets}
              selectedAssetId={selectedAssetId}
              setSelectedAssetId={setSelectedAssetId}
              dragOver={dragOver}
              setDragOver={setDragOver}
              file={file}
              fileError={fileError}
              parsedFile={parsedFile}
              onFileSelected={(f) => { void handleFileSelected(f); }}
            />
          )}

          {step === "headerConfirm" && (
            <HeaderConfirmStep
              rawPreviewLines={rawPreviewLines}
              onSelectHeaderRow={(idx) => void handleSelectHeaderRow(idx)}
            />
          )}

          {step === "mapping" && parsedFile && (
            <MappingStep
              parsedFile={parsedFile}
              rawGrid={rawGrid}
              headerRowIndex={headerRowIndex}
              matchedProfileName={matchedProfileName}
              roleByColumn={roleByColumn}
              setRoleByColumn={setRoleByColumn}
              dataTypeByColumn={dataTypeByColumn}
              setDataTypeByColumn={setDataTypeByColumn}
              setHasManuallyEditedMapping={setHasManuallyEditedMapping}
              autoDetectDataType={autoDetectDataType}
              applyMappingForHeaders={applyMappingForHeaders}
              accountLabels={accountLabels}
              mappingComplete={mappingComplete}
              coreRoleOptions={CORE_ROLE_OPTIONS}
              extraRoleLabels={EXTRA_ROLE_LABELS}
            />
          )}

          {step === "accountMapping" && (
            <AccountMappingStep
              accountLabels={accountLabels}
              accountMapDraft={accountMapDraft}
              setAccountMapDraft={setAccountMapDraft}
              accountAssets={accountAssets}
              newAccountNames={newAccountNames}
              setNewAccountNames={setNewAccountNames}
            />
          )}

          {step === "preview" && parsedFile && (
            <PreviewStep
              matchedProfileName={matchedProfileName}
              roleByColumn={roleByColumn}
              setStep={setStep}
              previewRows={previewRows}
              useMultiAccount={useMultiAccount}
              accountLabels={accountLabels}
              parsedFile={parsedFile}
              roleToIndex={roleToIndex}
              accountMapDraft={accountMapDraft}
              accountAssets={accountAssets}
              mode={mode}
              setMode={setMode}
              isFirstImport={isFirstImport}
              balanceInput={balanceInput}
              setBalanceInput={setBalanceInput}
              balanceUnknown={balanceUnknown}
              setBalanceUnknown={setBalanceUnknown}
              balanceHint={balanceHint}
            />
          )}

          {step === "progress" && (
            <ProgressStep
              parsedFile={parsedFile}
              matchedProfileName={matchedProfileName}
              useMultiAccount={useMultiAccount}
              accountMapDraft={accountMapDraft}
              progressPhase={progressPhase}
              progressDone={progressDone}
              progressTotal={progressTotal}
            />
          )}

          {step === "result" && (
            <ResultStep
              t={t}
              result={result}
              multiResult={multiResult}
              accountAssets={accountAssets}
            />
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
              <Button onClick={() => setStep("file")}>{t("import.file.otherFile")}</Button>
            </>
          )}
          {step === "result" && (result?.status === "success" || multiResult?.status === "success") && (
            <Button onClick={handleClose}>{t("import.result.done")}</Button>
          )}
        </div>
      </DialogContent>

      <Dialog open={!!pendingAmountChanges} onOpenChange={(open) => !open && setPendingAmountChanges(null)}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("import.result.amountsChanged")}</DialogTitle>
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
            <Button onClick={() => void executeImport(true)}>{t("import.result.acceptNewAmount")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
