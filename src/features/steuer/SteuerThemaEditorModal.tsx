import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCategories, groupCategories } from "@/hooks/useCategories";
import {
  createSteuerThema,
  deleteSteuerThema,
  updateSteuerThema,
  type SteuerThema,
} from "@/db/repositories/steuer";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import { useTranslation } from "react-i18next";

interface SteuerThemaEditorModalProps {
  open: boolean;
  thema: SteuerThema | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function SteuerThemaEditorModal({
  open,
  thema,
  onOpenChange,
  onSaved,
}: SteuerThemaEditorModalProps) {
  const { data: categories } = useCategories();
  const groups = useMemo(() => groupCategories(categories ?? []), [categories]);
  const { t } = useTranslation(["steuer", "app"]);
  const [name, setName] = useState("");
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(thema?.name ?? "");
    setCategoryIds(thema?.categoryIds ?? []);
    setKeywords(thema?.keywords ?? []);
    setKeywordInput("");
  }, [open, thema]);

  function toggleCategory(id: number, checked: boolean) {
    setCategoryIds((current) => checked ? [...current, id] : current.filter((candidate) => candidate !== id));
  }

  function addKeyword() {
    const keyword = keywordInput.trim().toLowerCase();
    if (!keyword || keywords.includes(keyword)) return;
    setKeywords((current) => [...current, keyword]);
    setKeywordInput("");
  }

  async function handleSubmit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const input = { name: name.trim(), categoryIds, keywords };
      if (thema) await updateSteuerThema(thema.id, input);
      else await createSteuerThema(input);
      toast.success(t("editor.savedSuccess"));
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`${t("editor.savedError")}: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!thema) return;
    await deleteSteuerThema(thema.id);
    toast.success(t("editor.deleteSuccess"));
    setConfirmDelete(false);
    onSaved();
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[620px]">
          <DialogHeader>
            <DialogTitle>{thema ? t("editor.editTitle") : t("editor.addTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="steuer-thema-name">{t("editor.name")}</Label>
              <Input
                id="steuer-thema-name"
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("editor.categories")}</Label>
              <div className="max-h-[220px] overflow-y-auto rounded-klein border border-border p-3">
                {groups.map((group) => (
                  <div key={group.parent.id} className="mb-3 last:mb-0">
                    <label className="flex items-center gap-2 text-sm font-medium text-charcoal">
                      <Checkbox
                        checked={categoryIds.includes(group.parent.id)}
                        onCheckedChange={(checked) => toggleCategory(group.parent.id, checked === true)}
                      />
                      {group.parent.name}
                    </label>
                    <div className="mt-2 grid grid-cols-1 gap-2 pl-6 sm:grid-cols-2">
                      {group.options
                        .filter((option) => option.category.id !== group.parent.id)
                        .map((option) => (
                          <label key={option.category.id} className="flex items-center gap-2 text-sm text-slate">
                            <Checkbox
                              checked={categoryIds.includes(option.category.id)}
                              onCheckedChange={(checked) => toggleCategory(option.category.id, checked === true)}
                            />
                            {option.category.name}
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="steuer-keyword">{t("editor.keywords")}</Label>
              <div className="flex gap-2">
                <Input
                  id="steuer-keyword"
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addKeyword();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addKeyword}>
                  <Plus className="size-4" />
                  {t("editor.addKeyword")}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-flex items-center gap-1 rounded-klein bg-paper px-2.5 py-1 text-xs text-charcoal"
                  >
                    {keyword}
                    <button
                      type="button"
                      aria-label={t("editor.removeKeyword", { keyword })}
                      onClick={() => setKeywords((current) => current.filter((candidate) => candidate !== keyword))}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {keywords.length === 0 && <span className="text-xs text-slate">{t("editor.noKeywords")}</span>}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {thema ? (
              <Button variant="destructive" type="button" onClick={() => setConfirmDelete(true)}>
                {t("app:common.delete")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
                {t("app:common.cancel")}
              </Button>
              <Button type="button" disabled={submitting || !name.trim()} onClick={() => void handleSubmit()}>
                {t("app:common.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {thema && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("editor.deleteConfirmTitle")}
          description={t("editor.deleteConfirmDesc")}
          confirmLabel={t("app:common.delete")}
          onConfirm={() => void handleDelete()}
        />
      )}
    </>
  );
}
