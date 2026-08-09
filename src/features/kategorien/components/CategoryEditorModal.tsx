import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as Icons from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import { createCategory, updateCategory, getCategoryAliases, addCategoryAlias, removeCategoryAlias } from "@/db/repositories/categories";
import type { Category } from "@/db/types";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { showErrorToast } from "@/lib/errorToast";

// Eigene, deutlich abgegrenzte Palette für Kategorie-Icons – bewusst getrennt von den 6 semantischen
// Statusfarben (chartColors: petrol/petrolLight/sage/brick/gold/slate), die für Vorzeichen/Zustand
// reserviert bleiben. Vorher überschnitten sich mehrere Einträge hier exakt mit diesen Statusfarben
// (siehe Bugfix-Runde 3, Punkt 6).
const COLOR_SWATCHES = [
  "#2f6b63",
  "#c9a44f",
  "#7aa662",
  "#4e8d7c",
  "#3f7d4e",
  "#5f7a9e",
  "#c07a4a",
  "#4a6fa5",
  "#2e6e5e",
  "#8a5fa0",
  "#3e8fa3",
  "#55606a",
  "#a9724f",
];

const ICON_CHOICES = [
  "home",
  "baby",
  "shopping-basket",
  "heart-pulse",
  "banknote",
  "shield",
  "ticket",
  "car",
  "piggy-bank",
  "shopping-bag",
  "plane",
  "landmark",
  "star",
  "gift",
  "briefcase",
  "book",
];

interface CategoryEditorModalProps {
  open: boolean;
  category: Category | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function CategoryEditorModal({ open, category, onOpenChange, onSaved }: CategoryEditorModalProps) {
  const { data: categories } = useCategories();
  const topLevel = (categories ?? []).filter((c) => c.parent_id === null);

  const [level, setLevel] = useState<"parent" | "child">("parent");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [icon, setIcon] = useState(ICON_CHOICES[0]);
  const [parentId, setParentId] = useState<number | null>(null);
  const [aliases, setAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isOwnCategory = !!category && category.is_template === 0 && category.is_system === 0;

  useEffect(() => {
    if (!open) return;
    if (category) {
      setLevel(category.parent_id ? "child" : "parent");
      setName(category.name);
      setColor(category.color);
      setIcon(category.icon ?? ICON_CHOICES[0]);
      setParentId(category.parent_id);
      if (category.is_template === 0 && category.is_system === 0) {
        getCategoryAliases(category.id).then(setAliases);
      } else {
        setAliases([]);
      }
    } else {
      setLevel("parent");
      setName("");
      setColor(COLOR_SWATCHES[0]);
      setIcon(ICON_CHOICES[0]);
      setParentId(topLevel[0]?.id ?? null);
      setAliases([]);
      setNewAlias("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  async function handleSubmit() {
    if (!name.trim()) return;
    if (level === "child" && !parentId) return;
    setSubmitting(true);
    try {
      if (category) {
        await updateCategory(category.id, {
          name: name.trim(),
          color: level === "parent" ? color : undefined,
          icon: level === "parent" ? icon : null,
          parent_id: level === "child" ? parentId : null,
        });
      } else {
        await createCategory({
          name: name.trim(),
          color: level === "parent" ? color : (categories?.find((c) => c.id === parentId)?.color ?? color),
          icon: level === "parent" ? icon : null,
          parent_id: level === "child" ? parentId : null,
        });
      }
      toast.success("Kategorie gespeichert");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`Fehler: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  const IconPreview = (Icons as unknown as Record<string, Icons.LucideIcon>)[
    icon.replace(/(^|-)([a-z])/g, (_, _sep, c) => c.toUpperCase())
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{category ? "Kategorie bearbeiten" : "Eigene Kategorie anlegen"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!category && (
            <RadioGroup value={level} onValueChange={(v) => setLevel(v as "parent" | "child")} className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="parent" />
                Oberkategorie
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="child" />
                Unterkategorie
              </label>
            </RadioGroup>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </div>

          {level === "child" && (
            <div className="space-y-1.5">
              <Label htmlFor="cat-parent">Oberkategorie</Label>
              <Select
                value={parentId ? String(parentId) : undefined}
                onValueChange={(v) => setParentId(Number(v))}
                disabled={!!category}
              >
                <SelectTrigger id="cat-parent">
                  <SelectValue placeholder="Oberkategorie wählen" />
                </SelectTrigger>
                <SelectContent>
                  {topLevel.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {level === "parent" && (
            <>
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <div className="grid grid-cols-8 gap-2">
                  {ICON_CHOICES.map((name) => {
                    const Comp = (Icons as unknown as Record<string, Icons.LucideIcon>)[
                      name.replace(/(^|-)([a-z])/g, (_, _sep, c) => c.toUpperCase())
                    ];
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setIcon(name)}
                        className={`flex size-8 items-center justify-center rounded-klein border ${
                          icon === name ? "border-petrol bg-petrol/10" : "border-border"
                        }`}
                      >
                        {Comp && <Comp className="size-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Farbe</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map((sw) => (
                    <button
                      key={sw}
                      type="button"
                      onClick={() => setColor(sw)}
                      className="size-7 rounded-full ring-offset-2"
                      style={{ backgroundColor: sw, boxShadow: color === sw ? `0 0 0 2px ${sw}` : undefined }}
                      aria-label={sw}
                    />
                  ))}
                </div>
              </div>
              {IconPreview && (
                <div className="flex items-center gap-2 text-sm text-slate">
                  Vorschau: <IconPreview className="size-4" style={{ color }} /> {name || "Kategorie"}
                </div>
              )}
            </>
          )}
        </div>

        {isOwnCategory && (
          <div className="space-y-2">
            <Label>Suchaliase</Label>
            <div className="flex flex-wrap gap-1.5">
              {aliases.map((alias) => (
                <span
                  key={alias}
                  className="inline-flex items-center gap-1 rounded-pill border border-border bg-accent px-2 py-0.5 text-xs"
                >
                  {alias}
                  <button
                    type="button"
                    aria-label={`Alias '${alias}' entfernen`}
                    className="text-slate hover:text-brick"
                    onClick={async () => {
                      await removeCategoryAlias(category!.id, alias);
                      setAliases((prev) => prev.filter((a) => a !== alias));
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newAlias}
                placeholder="Alias hinzufügen…"
                maxLength={40}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newAlias.trim()) {
                    e.preventDefault();
                    const trimmed = newAlias.trim();
                    if (!aliases.includes(trimmed)) {
                      void addCategoryAlias(category!.id, trimmed).then(() => {
                        setAliases((prev) => [...prev, trimmed]);
                        setNewAlias("");
                      });
                    }
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Alias hinzufügen"
                disabled={!newAlias.trim() || aliases.includes(newAlias.trim())}
                onClick={async () => {
                  const trimmed = newAlias.trim();
                  if (trimmed && !aliases.includes(trimmed)) {
                    await addCategoryAlias(category!.id, trimmed);
                    setAliases((prev) => [...prev, trimmed]);
                    setNewAlias("");
                  }
                }}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !name.trim()}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
