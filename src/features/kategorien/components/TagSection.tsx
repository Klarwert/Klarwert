import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Pencil, Trash2, Plus } from "lucide-react";
import { useTags } from "@/hooks/useTags";
import { countTagUsage, deleteTag } from "@/db/repositories/tags";
import { logSoftDelete } from "@/db/repositories/historyLog";
import { TagEditorModal } from "@/features/kategorien/components/TagEditorModal";
import type { Tag } from "@/db/types";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function TagSection() {
  const { t } = useTranslation(["kategorien", "app"]);
  const queryClient = useQueryClient();
  const { data: tags } = useTags();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ tag: Tag; count: number } | null>(null);

  const { data: counts } = useQuery({
    queryKey: ["tag-usage-counts", tags?.map((t) => t.id)],
    queryFn: async () => {
      const entries = await Promise.all((tags ?? []).map(async (t) => [t.id, await countTagUsage(t.id)] as const));
      return Object.fromEntries(entries);
    },
    enabled: !!tags,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["tags"] });
    void queryClient.invalidateQueries({ queryKey: ["tag-usage-counts"] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteTag(deleteTarget.tag.id);
    await logSoftDelete("tags", deleteTarget.tag.id, t("tags.deleteLog", { name: deleteTarget.tag.name }));
    toast.success(t("tags.deleteLog", { name: deleteTarget.tag.name }));
    setDeleteTarget(null);
    invalidate();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-charcoal">{t("tags.title")}</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="mr-1 size-4" />
          {t("tags.addBtn")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags?.map((tag) => (
          <div key={tag.id} className="flex items-center gap-3">
            <Badge style={{ backgroundColor: tag.color, color: "#fffdf8" }}>{tag.name}</Badge>
            <span className="text-xs text-slate">{counts?.[tag.id] ?? 0}×</span>
            <button
              type="button"
              aria-label={t("app:common.edit")}
              onClick={() => {
                setEditing(tag);
                setEditorOpen(true);
              }}
            >
              <Pencil className="size-3.5 text-slate" />
            </button>
            <button
              type="button"
              aria-label={t("app:common.delete")}
              onClick={() => setDeleteTarget({ tag: tag, count: counts?.[tag.id] ?? 0 })}
            >
              <Trash2 className="size-3.5 text-slate" />
            </button>
          </div>
        ))}
        {(!tags || tags.length === 0) && <p className="text-sm text-slate">{t("tags.noTags")}</p>}
      </div>

      <TagEditorModal open={editorOpen} tag={editing} onOpenChange={setEditorOpen} onSaved={invalidate} />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title={t("tags.deleteConfirmTitle", { name: deleteTarget.tag.name })}
          description={t("tags.deleteConfirmDesc", { count: deleteTarget.count })}
          confirmLabel={t("app:common.delete")}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}
