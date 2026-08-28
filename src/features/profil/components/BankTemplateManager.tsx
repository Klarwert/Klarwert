import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Copy, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createImportProfile, listImportProfiles, deleteImportProfile, type ParsedImportProfile, type CreateImportProfileInput } from "@/db/repositories/importProfiles";
import { BankTemplateEditorModal } from "@/features/profil/components/BankTemplateEditorModal";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import { computeHeaderFingerprint } from "@/lib/import/fingerprint";
import { useTranslation } from "react-i18next";

interface BankTemplateImportFile {
  source_version?: string;
  import_profiles?: Array<Partial<CreateImportProfileInput> & { name: string; column_map_json: string | Record<string, string> }>;
  profiles?: Array<Partial<CreateImportProfileInput> & { name: string; column_map_json: string | Record<string, string> }>;
}

type BankTemplateImportProfile = NonNullable<BankTemplateImportFile["profiles"]>[number];

export function BankTemplateManager() {
  const queryClient = useQueryClient();
  const { t } = useTranslation(["profil", "app"]);
  const { data: profiles } = useQuery({
    queryKey: ["import-profiles"],
    queryFn: listImportProfiles,
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ParsedImportProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ParsedImportProfile | null>(null);
  const [importProfiles, setImportProfiles] = useState<BankTemplateImportProfile[] | null>(null);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["import-profiles"] });
  }

  function openNew() {
    setEditingProfile(null);
    setEditorOpen(true);
  }

  function openEdit(profile: ParsedImportProfile) {
    setEditingProfile(profile);
    setEditorOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteImportProfile(deleteTarget.id);
      invalidate();
      toast.success(t("templates.removed"));
    } catch (e) {
      showErrorToast(`${t("templates.removeError")}: ${String(e)}`);
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleImportFile() {
    try {
      const path = await open({
        title: t("templates.importDialog"),
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return;
      const parsed = JSON.parse(await readTextFile(path)) as BankTemplateImportFile;
      const incoming = parsed.import_profiles ?? parsed.profiles ?? [];
      if (!Array.isArray(incoming) || incoming.length === 0) {
        throw new Error(t("templates.noTemplatesFound"));
      }
      setImportProfiles(incoming);
      setImportSelected(new Set(incoming.map((p) => p.name)));
    } catch (e) {
      showErrorToast(`${t("templates.importError")}: ${String(e)}`);
    }
  }

  async function handleApplyImport() {
    if (!importProfiles) return;
    try {
      const chosen = importProfiles.filter((p) => importSelected.has(p.name));
      for (const p of chosen) {
        const columnMap = typeof p.column_map_json === "string" ? p.column_map_json : JSON.stringify(p.column_map_json);
        const parsedMap = typeof p.column_map_json === "string" ? JSON.parse(p.column_map_json) as Record<string, string> : p.column_map_json;
        await createImportProfile({
          name: p.name,
          is_builtin: false,
          header_fingerprint: p.header_fingerprint ?? computeHeaderFingerprint(Object.values(parsedMap)),
          delimiter: p.delimiter ?? ";",
          encoding: p.encoding ?? "utf-8",
          date_format: p.date_format ?? "dd.MM.yyyy",
          decimal_format: p.decimal_format ?? "de",
          column_map_json: columnMap,
          import_all_columns: p.import_all_columns ?? true,
          locally_modified: true,
        });
      }
      setImportProfiles(null);
      setImportSelected(new Set());
      invalidate();
      toast.success(t("templates.importSuccess"));
    } catch (e) {
      showErrorToast(`${t("templates.importError")}: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate">
        {t("templates.description")}
      </p>
      <div className="grid gap-2">
        {(profiles ?? []).map((p) => (
          <div className="flex w-full items-center justify-between rounded-klein border border-border bg-paper p-3 hover:bg-accent/50" key={p.id}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-charcoal">{p.name}</span>
                {p.is_builtin === 1 && <Badge variant="secondary" className="text-[10px]">{t("templates.builtin")}</Badge>}
                {p.locally_modified === 1 && <Badge variant="outline" className="text-[10px]">{t("templates.modified")}</Badge>}
              </div>
              <p className="text-xs text-slate mt-0.5">
                {p.delimiter} / {p.decimal_format} — {Object.keys(p.column_map_json).length} {t("templates.columnsMapped")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                {p.is_builtin === 1 ? (
                  <>
                    <Copy className="mr-1 size-3.5" /> {t("templates.copyAndEdit")}
                  </>
                ) : (
                  <>
                    <Pencil className="mr-1 size-3.5" /> {t("app:common.edit")}
                  </>
                )}
              </Button>
              {p.is_builtin === 0 && (
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)}>
                  <Trash2 className="size-4 text-brick" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {(profiles ?? []).length === 0 && (
          <p className="px-4 py-3 text-sm text-slate">{t("templates.noneFound")}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void handleImportFile()}>
          <Upload className="mr-1.5 size-4" /> {t("app:common.import")}
        </Button>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 size-4" /> {t("templates.new")}
        </Button>
      </div>

      {importProfiles && (
        <div className="space-y-3 rounded-klein border border-border p-3">
          <p className="text-sm font-medium text-charcoal">{t("templates.importFromTitle")}</p>
          <div className="max-h-[220px] space-y-1 overflow-y-auto">
            {importProfiles.map((p) => (
              <label key={p.name} className={`flex items-center gap-2 rounded-md border border-border p-2 text-sm ${importSelected.has(p.name) ? "" : "opacity-50"}`}>
                <Checkbox
                  checked={importSelected.has(p.name)}
                  onCheckedChange={() => {
                    setImportSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.name)) next.delete(p.name);
                      else next.add(p.name);
                      return next;
                    });
                  }}
                />
                <span className="text-charcoal">{p.name}</span>
                <span className="text-slate">{p.delimiter ?? ";"} / {p.decimal_format ?? "de"}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setImportProfiles(null)}>{t("app:common.cancel")}</Button>
            <Button onClick={() => void handleApplyImport()} disabled={importSelected.size === 0}>{t("app:common.apply")}</Button>
          </div>
        </div>
      )}

      <BankTemplateEditorModal
        profile={editingProfile}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("templates.deleteTitle")}
        description={t("templates.deleteDesc", { name: deleteTarget?.name })}
        confirmLabel={t("app:common.delete")}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
