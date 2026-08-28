import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { useCollections } from "@/hooks/useCollections";
import {
  deleteCollection,
  getCollectionSummary,
  getCollectionTransactions,
  removeTransactionFromCollection,
} from "@/db/repositories/collections";
import { CollectionEditorModal } from "@/features/sammlungen/components/CollectionEditorModal";
import { AddByPeriodModal } from "@/features/sammlungen/components/AddByPeriodModal";
import { formatEur } from "@/lib/money";
import { logSoftDelete } from "@/db/repositories/historyLog";
import type { Collection } from "@/db/types";
import { toast } from "sonner";

export function SammlungenPage() {
  const { t } = useTranslation(["sammlungen", "app"]);
  const queryClient = useQueryClient();
  const { data: collections } = useCollections();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [addByPeriodOpen, setAddByPeriodOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);

  const { data: summaries } = useQuery({
    queryKey: ["collection-summaries", collections?.map((c) => c.id)],
    queryFn: async () => {
      const entries = await Promise.all(
        (collections ?? []).map(async (c) => [c.id, await getCollectionSummary(c.id)] as const),
      );
      return Object.fromEntries(entries);
    },
    enabled: !!collections,
  });

  const { data: activeTransactions, refetch: refetchActiveTx } = useQuery({
    queryKey: ["collection-transactions", activeId],
    queryFn: () => getCollectionTransactions(activeId!),
    enabled: activeId !== null,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-summaries"] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteCollection(deleteTarget.id);
    await logSoftDelete("collections", deleteTarget.id, t("deletedLog", { name: deleteTarget.name }));
    toast.success(t("deleted", { name: deleteTarget.name }));
    setDeleteTarget(null);
    if (activeId === deleteTarget.id) setActiveId(null);
    invalidate();
  }

  const activeCollection = collections?.find((c) => c.id === activeId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl text-charcoal">{t("title")}</h1>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="mr-1.5 size-4" />
          {t("add")}
        </Button>
      </div>

      <div className="rounded-klein bg-accent p-3 text-xs text-slate">
        {t("description")}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {collections?.map((c) => {
          const summary = summaries?.[c.id];
          const progress = c.is_goal && c.target_cents ? Math.min(100, ((summary?.sumCents ?? 0) / c.target_cents) * 100) : null;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`rounded-standard border p-4 text-left ${
                activeId === c.id ? "border-petrol bg-petrol/5" : "border-border bg-card hover:bg-accent"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-charcoal">{c.name}</span>
                {c.status === "completed" && <span className="text-xs text-slate">{t("completed")}</span>}
              </div>
              <div className="num mt-1 text-lg text-charcoal">
                {formatEur(summary?.sumCents ?? 0)}
                {c.is_goal && c.target_cents ? ` / ${formatEur(c.target_cents)}` : ""}
              </div>
              <div className="text-xs text-slate">{t("transactions", { count: summary?.count ?? 0 })}</div>
              {progress !== null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-accent">
                  <div className="h-full bg-sage" style={{ width: `${progress}%` }} />
                </div>
              )}
              <div className="mt-3 flex justify-end gap-1">
                <span
                  role="button"
                  className="rounded p-1 hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(c);
                    setEditorOpen(true);
                  }}
                >
                  <Pencil className="size-3.5" />
                </span>
                <span
                  role="button"
                  className="rounded p-1 hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(c);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </span>
              </div>
            </button>
          );
        })}
        {(!collections || collections.length === 0) && (
          <p className="col-span-full text-sm text-slate">{t("noCollections")}</p>
        )}
      </div>

      {activeCollection && (
        <div className="rounded-standard border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium text-charcoal">{activeCollection.name}</h2>
            <Button size="sm" onClick={() => setAddByPeriodOpen(true)}>
              {t("addByPeriod")}
            </Button>
          </div>
          <div className="space-y-1">
            {activeTransactions?.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between border-b border-border py-1.5 text-sm last:border-0">
                <span className="text-charcoal">
                  {tx.booking_date} · {tx.counterparty}
                </span>
                <div className="flex items-center gap-2">
                  <span className="num text-charcoal">{formatEur(tx.amount_cents)}</span>
                  <button
                    type="button"
                    aria-label={t("remove")}
                    onClick={() => void removeTransactionFromCollection(activeCollection.id, tx.id).then(() => refetchActiveTx())}
                  >
                    <X className="size-3.5 text-slate" />
                  </button>
                </div>
              </div>
            ))}
            {(!activeTransactions || activeTransactions.length === 0) && (
              <p className="text-sm text-slate">{t("noTransactions")}</p>
            )}
          </div>
        </div>
      )}

      <CollectionEditorModal open={editorOpen} collection={editing} onOpenChange={setEditorOpen} onSaved={invalidate} />
      {activeId !== null && (
        <AddByPeriodModal
          open={addByPeriodOpen}
          collectionId={activeId}
          onOpenChange={setAddByPeriodOpen}
          onAdded={() => {
            invalidate();
            void refetchActiveTx();
          }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title={t("deleteTitle", { name: deleteTarget.name })}
          description={t("deleteDesc")}
          confirmLabel={t("app:common.delete")}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}
