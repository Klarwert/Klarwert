import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ParsedImportProfile } from "@/db/repositories/importProfiles";
import {
  ALL_COLUMN_ROLES,

  COLUMN_ROLE_LABELS,
  type ColumnRole,
} from "@/lib/import/bankProfiles";
import { computeHeaderFingerprint } from "@/lib/import/fingerprint";
import {
  createImportProfile,
  updateImportProfile,
} from "@/db/repositories/importProfiles";
import { showErrorToast } from "@/lib/errorToast";

interface ColumnRow {
  header: string;
  role: ColumnRole | "none";
}

export interface BankTemplateEditorModalProps {
  profile: ParsedImportProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const DATE_FORMATS = [
  { value: "dd.MM.yyyy", label: "31.12.2025" },
  { value: "dd.MM.yy", label: "31.12.25" },
  { value: "yyyy-MM-dd", label: "2025-12-31" },
];

function emptyRow(): ColumnRow {
  return { header: "", role: "none" };
}

export function BankTemplateEditorModal({
  profile,
  open,
  onOpenChange,
  onSaved,
}: BankTemplateEditorModalProps) {
  const { t } = useTranslation("profil");
  const DELIMITERS: { value: "," | ";" | "\t"; label: string }[] = [
    { value: ";", label: t("templates.editorModal.delimiterSemicolon") },
    { value: ",", label: t("templates.editorModal.delimiterComma") },
    { value: "\t", label: t("templates.editorModal.delimiterTab") },
  ];
  const ENCODINGS = [
    { value: "utf-8", label: t("templates.editorModal.encodingUtf8") },
    { value: "windows-1252", label: t("templates.editorModal.encodingWindows1252") },
  ];
  const DECIMAL_FORMATS: { value: "de" | "en"; label: string }[] = [
    { value: "de", label: t("templates.editorModal.decimalDe") },
    { value: "en", label: t("templates.editorModal.decimalEn") },
  ];
  const [name, setName] = useState("");
  const [rows, setRows] = useState<ColumnRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [delimiter, setDelimiter] = useState<"," | ";" | "\t">(";");
  const [encoding, setEncoding] = useState("utf-8");
  const [dateFormat, setDateFormat] = useState("dd.MM.yyyy");
  const [decimalFormat, setDecimalFormat] = useState<"de" | "en">("de");
  const [importAllColumns, setImportAllColumns] = useState(false);
  const [saving, setSaving] = useState(false);

  const isBuiltin = profile?.is_builtin === 1;

  useEffect(() => {
    if (!open) return;
    if (profile) {
      setName(isBuiltin ? `${profile.name} ${t("templates.editorModal.copySuffix")}` : profile.name);
      let columnMap: Record<string, string> = {};
      try {
        columnMap = profile.column_map_json;
      } catch {
        columnMap = {};
      }
      const mappedRows: ColumnRow[] = Object.entries(columnMap).map(([role, header]) => ({
        header: String(header),
        role: role as ColumnRole,
      }));
      setRows(mappedRows.length > 0 ? mappedRows : [emptyRow(), emptyRow(), emptyRow()]);
      setDelimiter(profile.delimiter ?? ";");
      setEncoding(profile.encoding ?? "utf-8");
      setDateFormat(profile.date_format ?? "dd.MM.yyyy");
      setDecimalFormat(profile.decimal_format ?? "de");
      setImportAllColumns(profile.import_all_columns === 1);
    } else {
      setName("");
      setRows([emptyRow(), emptyRow(), emptyRow()]);
      setDelimiter(";");
      setEncoding("utf-8");
      setDateFormat("dd.MM.yyyy");
      setDecimalFormat("de");
      setImportAllColumns(false);
    }
  }, [open, profile, isBuiltin, t]);

  function updateRow(index: number, patch: Partial<ColumnRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  async function handleSave() {
    const filledRows = rows.filter((r) => r.header.trim());
    if (!name.trim()) {
      showErrorToast(t("templates.editorModal.errorNameRequired"));
      return;
    }
    if (filledRows.length === 0) {
      showErrorToast(t("templates.editorModal.errorColumnRequired"));
      return;
    }
    const usedRoles = filledRows.filter((r) => r.role !== "none").map((r) => r.role);
    if (!usedRoles.includes("date") || !usedRoles.includes("amount")) {
      showErrorToast(t("templates.editorModal.errorRolesRequired"));
      return;
    }

    const columnMap: Record<string, string> = {};
    for (const r of filledRows) {
      if (r.role !== "none") columnMap[r.role] = r.header.trim();
    }
    const headerFingerprint = computeHeaderFingerprint(filledRows.map((r) => r.header));

    setSaving(true);
    try {
      if (profile && !isBuiltin) {
        await updateImportProfile(profile.id, {
          name: name.trim(),
          header_fingerprint: headerFingerprint,
          delimiter,
          encoding,
          date_format: dateFormat,
          decimal_format: decimalFormat,
          column_map_json: JSON.stringify(columnMap),
          import_all_columns: importAllColumns,
          locally_modified: true,
        });
        toast.success(t("templates.editorModal.updated"));
      } else {
        // Neu oder Kopie einer mitgelieferten Vorlage – nie in-place überschreiben.
        await createImportProfile({
          name: name.trim(),
          is_builtin: false,
          header_fingerprint: headerFingerprint,
          delimiter,
          encoding,
          date_format: dateFormat,
          decimal_format: decimalFormat,
          column_map_json: JSON.stringify(columnMap),
          import_all_columns: importAllColumns,
        });
        toast.success(isBuiltin ? t("templates.editorModal.copyCreated") : t("templates.editorModal.created"));
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(t("templates.editorModal.saveFailed", { error: String(e) }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {profile
              ? isBuiltin
                ? t("templates.editorModal.titleEditCopy")
                : t("templates.editorModal.titleEdit")
              : t("templates.editorModal.titleNew")}
          </DialogTitle>
          <DialogDescription>
            {isBuiltin ? t("templates.editorModal.descBuiltin") : t("templates.editorModal.descCustom")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">{t("templates.editorModal.nameLabel")}</Label>
            <Input
              id="template-name"
              placeholder={t("templates.editorModal.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("templates.editorModal.columnsLabel")}</Label>
            <p className="text-xs text-slate">{t("templates.editorModal.columnsHint")}</p>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder={t("templates.editorModal.headerPlaceholder")}
                    value={row.header}
                    onChange={(e) => updateRow(i, { header: e.target.value })}
                    className="flex-1"
                  />
                  <Select
                    value={row.role}
                    onValueChange={(val: ColumnRole | "none") => updateRow(i, { role: val })}
                  >
                    <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("templates.editorModal.noRole")}</SelectItem>
                      {ALL_COLUMN_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {COLUMN_ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
                    <Trash2 className="size-4 text-brick" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={addRow}>
              <Plus className="mr-1 size-4" /> {t("templates.editorModal.addColumn")}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="import-all-columns"
              checked={importAllColumns}
              onCheckedChange={(c) => setImportAllColumns(!!c)}
            />
            <Label htmlFor="import-all-columns" className="cursor-pointer text-sm">
              {t("templates.editorModal.importAllColumns")}
            </Label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("templates.editorModal.delimiterLabel")}</Label>
              <Select value={delimiter} onValueChange={(val: "," | ";" | "\t") => setDelimiter(val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIMITERS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("templates.editorModal.encodingLabel")}</Label>
              <Select value={encoding} onValueChange={setEncoding}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENCODINGS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("templates.editorModal.dateFormatLabel")}</Label>
              <Select value={dateFormat} onValueChange={setDateFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATE_FORMATS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("templates.editorModal.decimalFormatLabel")}</Label>
              <Select value={decimalFormat} onValueChange={(val: "de" | "en") => setDecimalFormat(val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DECIMAL_FORMATS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("templates.editorModal.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {isBuiltin ? t("templates.editorModal.saveAsCopy") : t("templates.editorModal.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
