import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Icons from "lucide-react";
import { MoreHorizontal, Pencil, Plus, EyeOff, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCategories, translateCategoryName } from "@/hooks/useCategories";
import { useRules } from "@/hooks/useRules";
import { getCategoryYearSums, countCategoryUsage, deleteCategory, setCategoryHidden, restoreDefaultCategories } from "@/db/repositories/categories";
import { logSoftDelete } from "@/db/repositories/historyLog";
import { CategoryEditorModal } from "@/features/kategorien/components/CategoryEditorModal";
import { CategoryDrawer } from "@/features/kategorien/components/CategoryDrawer";
import { TemplateVisibilityDrawer } from "@/features/kategorien/components/TemplateVisibilityDrawer";
import { RulesManagerDrawer } from "@/features/kategorien/components/RulesManagerDrawer";
import { SparzweckSection } from "@/features/kategorien/components/SparzweckSection";
import { TagSection } from "@/features/kategorien/components/TagSection";
import { HaendlerSection } from "@/features/kategorien/components/HaendlerSection";
import { useGlobalFilterStore } from "@/stores/globalFilterStore";
import { formatEur } from "@/lib/money";
import type { Category } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

function iconComponent(name: string | null) {
  if (!name) return null;
  const pascal = name.replace(/(^|-)([a-z])/g, (_, _sep, c: string) => c.toUpperCase());
  return (Icons as unknown as Record<string, Icons.LucideIcon>)[pascal] ?? null;
}

export function KategorienPage() {
  const { t } = useTranslation(["kategorien", "app"]);
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const { data: rules } = useRules();
  const selectedAccountId = useGlobalFilterStore((s) => s.selectedAccountId);
  const selectedPersonId = useGlobalFilterStore((s) => s.selectedPersonId);

  const [activeTab, setActiveTab] = useState<"kategorien" | "sparzwecke" | "tags" | "haendler">("kategorien");
  const [scope, setScope] = useState<"all" | "own">("all");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [drawerCategory, setDrawerCategory] = useState<Category | null>(null);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ category: Category; count: number } | null>(null);

  const year = new Date().getFullYear();
  const { data: yearSums } = useQuery({
    queryKey: ["category-year-sums", year, selectedAccountId, selectedPersonId],
    queryFn: () => getCategoryYearSums(year, selectedAccountId, selectedPersonId),
  });

  function ruleCount(categoryId: number): number {
    return rules?.filter((r) => r.category_id === categoryId).length ?? 0;
  }

  function invalidateCategories() {
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
  }

  const topLevel = useMemo(() => {
    const visible = (categories ?? []).filter((c) => scope === "all" || c.is_template === 0);
    const searchLower = search.trim().toLowerCase();
    
    if (!searchLower) {
      return visible.filter((c) => c.parent_id === null).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    }

    // When searching, show all matching categories flat (parent + children)
    const matchingIds = new Set<number>();
    for (const c of visible) {
      const nameMatch = translateCategoryName(c).toLowerCase().includes(searchLower);
      const aliasMatch = (c.aliases ?? []).some((a) => a.toLowerCase().includes(searchLower));
      if (nameMatch || aliasMatch) {
        matchingIds.add(c.id);
        // Also show parent
        if (c.parent_id) matchingIds.add(c.parent_id);
      }
    }
    return visible.filter((c) => c.parent_id === null && matchingIds.has(c.id)).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [categories, scope, search]);

  function childrenOf(parentId: number): Category[] {
    const searchLower = search.trim().toLowerCase();
    const children = (categories ?? []).filter(
      (c) => c.parent_id === parentId && (scope === "all" || c.is_template === 0),
    );
    if (!searchLower) return children;
    return children.filter((c) => {
      const nameMatch = translateCategoryName(c).toLowerCase().includes(searchLower);
      const aliasMatch = (c.aliases ?? []).some((a) => a.toLowerCase().includes(searchLower));
      return nameMatch || aliasMatch;
    });
  }

  async function handleDeleteOrHide(category: Category) {
    const count = await countCategoryUsage(category.id);
    if (count === 0) {
      setDeleteTarget({ category, count });
    } else {
      await setCategoryHidden(category.id, true);
      toast.info(t("categories.hidden", { name: translateCategoryName(category), count }));
      invalidateCategories();
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteCategory(deleteTarget.category.id);
    const deletedName = translateCategoryName(deleteTarget.category);
    await logSoftDelete("categories", deleteTarget.category.id, t("categories.deletedLog", { name: deletedName }));
    toast.success(t("categories.deleted", { name: deletedName }));
    setDeleteTarget(null);
    invalidateCategories();
  }

  function renderRow(category: Category, isChild: boolean) {
    const Icon = !isChild ? iconComponent(category.icon) : null;
    const isOwn = category.is_template === 0 && category.is_system === 0;
    return (
      <div
        key={category.id}
        className={`flex items-center gap-2 border-b border-border px-3 py-2 last:border-0 hover:bg-accent ${isChild ? "pl-10" : ""}`}
      >
        <button
          type="button"
          onClick={() => setDrawerCategory(category)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {Icon && <Icon className="size-4" style={{ color: category.color }} />}
          <span className="text-sm" style={{ color: isChild ? category.color : undefined }}>
            {translateCategoryName(category)}
          </span>
          {isOwn && <Pencil className="size-3 text-slate" />}
        </button>
        <span className="num text-xs text-slate">{formatEur(yearSums?.get(category.id) ?? 0)}</span>
        <span className="text-xs text-slate">{t("categories.rules", { count: ruleCount(category.id) })}</span>
        {isOwn && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={t("categories.editLabel")}
              onClick={() => {
                setEditingCategory(category);
                setEditorOpen(true);
              }}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={t("categories.deleteLabel")}
              onClick={() => void handleDeleteOrHide(category)}
            >
              {category.is_hidden ? <EyeOff className="size-3.5" /> : <Trash2 className="size-3.5" />}
            </Button>
          </>
        )}
      </div>
    );
  }

  async function handleRestoreDefaults() {
    try {
      await restoreDefaultCategories();
      invalidateCategories();
      toast.success(t("categories.restored"));
    } catch (e) {
      showErrorToast(t("categories.restoreError", { error: String(e) }));
    }
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="kategorien">{t("categories.title")}</TabsTrigger>
          <TabsTrigger value="sparzwecke">{t("sparzwecke.title")}</TabsTrigger>
          <TabsTrigger value="tags">{t("tags.title")}</TabsTrigger>
          <TabsTrigger value="haendler">{t("merchants.title")}</TabsTrigger>
        </TabsList>

        <TabsContent value="kategorien" className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("app:common.search")}
                  className="h-8 w-40 pl-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEditingCategory(null);
                  setEditorOpen(true);
                }}
              >
                <Plus className="mr-1.5 size-4" />
                {t("categories.addBtn")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label={t("app:common.actions")}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setTemplateDrawerOpen(true)}>
                    {t("categories.manageTemplates")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleRestoreDefaults()}>
                    {t("categories.restoreDefaults")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRulesDrawerOpen(true)}>{t("categories.manageRules")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div role="radiogroup" className="inline-flex rounded-klein border border-border">
              {(["all", "own"] as const).map((s, i) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={scope === s}
                  onClick={() => setScope(s)}
                  className={`px-3 py-1.5 text-sm transition-colors ${i > 0 ? "border-l border-border" : ""} ${
                    scope === s ? "bg-petrol text-card" : "text-charcoal hover:bg-accent"
                  }`}
                >
                  {s === "all" ? t("categories.scopeAll") : t("categories.scopeOwn")}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-standard border border-border bg-card">
            {topLevel.map((parent) => (
              <div key={parent.id}>
                {renderRow(parent, false)}
                {childrenOf(parent.id).map((child) => renderRow(child, true))}
              </div>
            ))}
            {topLevel.length === 0 && <p className="p-3 text-sm text-slate">{t("categories.noResults")}</p>}
          </div>
        </TabsContent>

        <TabsContent value="sparzwecke" className="mt-6">
          <SparzweckSection />
        </TabsContent>

        <TabsContent value="tags" className="mt-6">
          <TagSection />
        </TabsContent>

        <TabsContent value="haendler" className="mt-6">
          <HaendlerSection />
        </TabsContent>
      </Tabs>

      <CategoryEditorModal
        open={editorOpen}
        category={editingCategory}
        onOpenChange={setEditorOpen}
        onSaved={invalidateCategories}
      />
      <CategoryDrawer category={drawerCategory} onOpenChange={(o) => !o && setDrawerCategory(null)} />
      <TemplateVisibilityDrawer open={templateDrawerOpen} onOpenChange={setTemplateDrawerOpen} />
      <RulesManagerDrawer open={rulesDrawerOpen} onOpenChange={setRulesDrawerOpen} />

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title={`"${translateCategoryName(deleteTarget.category)}" ${t("app:common.delete")}?`}
          description={t("categories.deleteConfirm", { name: translateCategoryName(deleteTarget.category) })}
          confirmLabel={t("app:common.delete")}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}
