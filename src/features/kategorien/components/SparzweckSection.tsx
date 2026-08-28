import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Pencil, Trash2, Plus } from "lucide-react";
import { useSparzwecke } from "@/hooks/useSparzwecke";
import { getCumulativeSaving, deleteSparzweck } from "@/db/repositories/sparzwecke";
import { addHistoryEntry } from "@/db/repositories/historyLog";
import { formatEur } from "@/lib/money";
import { SparzweckEditorModal } from "@/features/kategorien/components/SparzweckEditorModal";
import type { Sparzweck } from "@/db/types";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function SparzweckSection() {
  const { t } = useTranslation(["vermoegen", "app"]);
  const queryClient = useQueryClient();
  const { data: sparzwecke } = useSparzwecke();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Sparzweck | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sparzweck | null>(null);

  const { data: totals } = useQuery({
    queryKey: ["sparzwecke-totals-page", sparzwecke?.map((s) => s.id)],
    queryFn: async () => {
      const entries = await Promise.all(
        (sparzwecke ?? []).map(async (s) => [s.id, await getCumulativeSaving(s.id)] as const),
      );
      return Object.fromEntries(entries);
    },
    enabled: !!sparzwecke,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["sparzwecke"] });
    void queryClient.invalidateQueries({ queryKey: ["sparzwecke-totals-page"] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteSparzweck(deleteTarget.id);
    await addHistoryEntry({
      action_type: "sparzweck_delete",
      description: t("sparzwecke.deleteLog", { name: deleteTarget.name }),
      payload: { sparzweckId: deleteTarget.id },
    });
    toast.success(t("sparzwecke.deleteLog", { name: deleteTarget.name }));
    setDeleteTarget(null);
    invalidate();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-charcoal">{t("sparzwecke.title")}</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="mr-1 size-4" />
          {t("sparzwecke.addBtn")}
        </Button>
      </div>
      <div className="rounded-standard border border-border bg-card">
        {sparzwecke?.map((s) => (
          <div key={s.id} className="flex items-center gap-3 border-b border-border p-2 last:border-0">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="flex-1 text-sm text-charcoal">{s.name}</span>
            <span className="num text-sm text-slate">
              {formatEur(totals?.[s.id] ?? 0)}
              {s.target_cents ? ` / ${formatEur(s.target_cents)}` : ""}
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("app:common.edit")}
              onClick={() => {
                setEditing(s);
                setEditorOpen(true);
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label={t("app:common.delete")} onClick={() => setDeleteTarget(s)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {(!sparzwecke || sparzwecke.length === 0) && (
          <p className="p-3 text-sm text-slate">{t("sparzwecke.noGoalsSection")}</p>
        )}
      </div>

      <SparzweckEditorModal open={editorOpen} sparzweck={editing} onOpenChange={setEditorOpen} onSaved={invalidate} />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title={t("sparzwecke.deleteConfirmTitle", { name: deleteTarget.name })}
          description={t("sparzwecke.deleteConfirmDesc")}
          confirmLabel={t("app:common.delete")}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}
