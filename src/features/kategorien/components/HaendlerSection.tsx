import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Plus, Pencil, Trash2, Store, Search, Share2, RefreshCw } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import {
  listAllMerchants,
  listMerchantAliases,
  deleteMerchant,
  updateMerchant,
} from "@/db/repositories/merchants";
import { MerchantEditorModal } from "@/features/kategorien/components/MerchantEditorModal";
import { ShareSuggestionsDialog } from "@/features/kategorien/components/ShareSuggestionsDialog";
import { MerchantUpdateCheckDialog } from "@/features/kategorien/components/MerchantUpdateCheckDialog";
import type { Merchant } from "@/db/types";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

/**
 * Kategorien → Abschnitt Händler-Datenbank (Product Spec 4.6, Component Library B14/B15).
 * Seit der Zusammenführung mit den Regel-Vorlagen (klarwert-haendler-regel-konzept-v2.md):
 * ein Aktiv/Inaktiv-Toggle für ALLE Händler (kuratiert wie eigen, ersetzt "Unterdrücken"), ein
 * rein informativer Herkunfts-Tag (Kuratiert/Angepasst/Eigene), kuratierte Einträge editierbar.
 */
export function HaendlerSection() {
  const { t } = useTranslation(["kategorien", "app"]);
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const { data: merchants } = useQuery({ queryKey: ["merchants", "all"], queryFn: listAllMerchants });
  const { data: aliases } = useQuery({ queryKey: ["merchant-aliases"], queryFn: () => listMerchantAliases() });

  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Merchant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Merchant | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [updateCheckOpen, setUpdateCheckOpen] = useState(false);

  const aliasesByMerchant = useMemo(() => {
    const map = new Map<number, typeof aliases>();
    for (const a of aliases ?? []) {
      const list = map.get(a.merchant_id) ?? [];
      list.push(a);
      map.set(a.merchant_id, list);
    }
    return map;
  }, [aliases]);

  function categoryName(id: number | null): string {
    if (!id) return t("merchants.noParent");
    return categories?.find((c) => c.id === id)?.name ?? "?";
  }

  function originLabel(m: Merchant): string {
    if (m.is_builtin === 0) return t("merchants.origin.own");
    return m.is_modified === 1 ? t("merchants.origin.modified") : t("merchants.origin.template");
  }

  const filtered = (merchants ?? []).filter((m) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    if (m.display_name.toLowerCase().includes(q)) return true;
    const list = aliasesByMerchant.get(m.id) ?? [];
    return list.some((a: any) => a.match_value.toLowerCase().includes(q));
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["merchants"] });
    void queryClient.invalidateQueries({ queryKey: ["merchant-aliases"] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteMerchant(deleteTarget.id);
    toast.success(t("merchants.deletedSuccess", { name: deleteTarget.display_name }));
    setDeleteTarget(null);
    invalidate();
  }

  async function handleToggleActive(merchant: Merchant, active: boolean) {
    await updateMerchant(merchant.id, { is_active: active ? 1 : 0 });
    invalidate();
  }

  const hasAnyAutomaticCategorization = (merchants ?? []).length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg text-charcoal">{t("merchants.title")}</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)} disabled={!hasAnyAutomaticCategorization}>
            <Share2 className="mr-1 size-4" />
            {t("merchants.shareBtn")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setUpdateCheckOpen(true)} disabled={!hasAnyAutomaticCategorization}>
            <RefreshCw className="mr-1 size-4" />
            {t("merchants.checkUpdate")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="mr-1 size-4" />
            {t("merchants.addBtn", "Händler")}
          </Button>
        </div>
      </div>

      {!hasAnyAutomaticCategorization ? (
        <p className="rounded-standard border border-border bg-card p-3 text-sm text-slate">
          {t("merchants.emptyDesc")}
        </p>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("merchants.search")}
              className="h-8 pl-8 text-sm"
            />
          </div>

          <div role="table" className="rounded-standard border border-border bg-card">
            {filtered.map((m) => {
              const rowAliases = (aliasesByMerchant.get(m.id) ?? []) as any[];
              const origin = originLabel(m);
              return (
                <div
                  key={m.id}
                  role="row"
                  className={`flex flex-wrap items-start gap-3 border-b border-border p-2.5 last:border-0 ${
                    m.is_active === 0 ? "opacity-50" : ""
                  }`}
                >
                  <Store className="mt-1 size-4 shrink-0 text-slate" />
                  <div className="min-w-[140px] flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-charcoal">{m.display_name}</span>
                      <Badge variant="outline" className={origin === t("merchants.origin.own") ? "border-sage text-sage" : "text-slate"}>
                        {origin}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate">
                      <span>{categoryName(m.default_category_id)}</span>
                    </div>
                    {rowAliases.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {rowAliases.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-[11px] text-slate"
                          >
                            {a.match_value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={m.is_active === 1}
                      onCheckedChange={(checked) => void handleToggleActive(m, checked)}
                      aria-label={m.is_active === 1 ? t("merchants.active") : t("merchants.inactive")}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("app:common.edit")}
                      onClick={() => {
                        setEditing(m);
                        setEditorOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {m.is_builtin === 0 && (
                      <Button size="icon" variant="ghost" aria-label={t("app:common.delete")} onClick={() => setDeleteTarget(m)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="p-3 text-sm text-slate">{t("app:common.noResults")}</p>}
          </div>
        </>
      )}

      <MerchantEditorModal open={editorOpen} merchant={editing} onOpenChange={setEditorOpen} onSaved={invalidate} />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title={t("merchants.deleteTargetConfirm", { name: deleteTarget.display_name })}
          description={t("merchants.deleteTargetDesc")}
          confirmLabel={t("app:common.delete")}
          onConfirm={() => void handleDelete()}
        />
      )}
      <ShareSuggestionsDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        ownMerchants={(merchants ?? []).filter((m) => m.is_builtin === 0 || m.is_modified === 1)}
        categories={categories ?? []}
        onImported={invalidate}
      />
      <MerchantUpdateCheckDialog
        open={updateCheckOpen}
        onOpenChange={setUpdateCheckOpen}
        currentMerchants={merchants ?? []}
        categories={categories ?? []}
        onApplied={invalidate}
      />
    </div>
  );
}
