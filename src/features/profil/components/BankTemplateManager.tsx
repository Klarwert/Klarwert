import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { listImportProfiles, deleteImportProfile } from "@/db/repositories/importProfiles";
import type { ImportProfile } from "@/db/types";
import { BankTemplateEditorModal } from "@/features/profil/components/BankTemplateEditorModal";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

export function BankTemplateManager() {
  const queryClient = useQueryClient();
  const { data: profiles } = useQuery({
    queryKey: ["import-profiles"],
    queryFn: listImportProfiles,
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ImportProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImportProfile | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["import-profiles"] });
  }

  function openNew() {
    setEditingProfile(null);
    setEditorOpen(true);
  }

  function openEdit(profile: ImportProfile) {
    setEditingProfile(profile);
    setEditorOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteImportProfile(deleteTarget.id);
      invalidate();
      toast.success("Vorlage entfernt");
    } catch (e) {
      showErrorToast(`Löschen fehlgeschlagen: ${String(e)}`);
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate">
        Bank-Vorlagen legen fest, wie Klarwert eine CSV-Datei deiner Bank liest (welche Spalte Datum, Betrag,
        Empfänger usw. ist). Mitgelieferte Vorlagen sind geschützt – bearbeite sie, um automatisch eine eigene
        Kopie anzulegen.
      </p>
      <div className="divide-y divide-border/60 rounded-klein border border-border">
        {(profiles ?? []).map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-charcoal">{p.name}</span>
              {p.is_builtin === 1 && <Badge variant="secondary">mitgeliefert</Badge>}
              {p.locally_modified === 1 && <Badge variant="outline">angepasst</Badge>}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                {p.is_builtin === 1 ? (
                  <>
                    <Copy className="mr-1 size-3.5" /> Kopieren & Bearbeiten
                  </>
                ) : (
                  <>
                    <Pencil className="mr-1 size-3.5" /> Bearbeiten
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
          <p className="px-4 py-3 text-sm text-slate">Noch keine Vorlagen vorhanden.</p>
        )}
      </div>
      <Button variant="outline" onClick={openNew}>
        <Plus className="mr-1.5 size-4" /> Neue Vorlage
      </Button>

      <BankTemplateEditorModal
        profile={editingProfile}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Vorlage löschen?"
        description={`"${deleteTarget?.name}" wird nicht mehr zur automatischen Erkennung beim Import verwendet.`}
        confirmLabel="Löschen"
        onConfirm={handleDelete}
      />
    </div>
  );
}
