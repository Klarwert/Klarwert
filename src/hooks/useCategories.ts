import { useQuery } from "@tanstack/react-query";
import { listCategories } from "@/db/repositories/categories";
import type { Category } from "@/db/types";
import i18n from "@/i18n";

/**
 * Übersetzt den Anzeigenamen einer Template-Kategorie über ihren stabilen `template_key`
 * (siehe categories.ts, TEMPLATE_CATEGORIES) - nutzerangelegte Kategorien haben keinen
 * template_key und behalten immer ihren eigenen, unübersetzten Namen.
 */
export function translateCategoryName(category: Pick<Category, "name" | "template_key">): string {
  if (!category.template_key) return category.name;
  return i18n.t(`categories:${category.template_key}`, { defaultValue: category.name });
}

/**
 * `category.name` bleibt bewusst der rohe DB-Wert (nie übersetzt) - CategoryEditorModal befüllt
 * sein Namensfeld direkt daraus, und ein Speichern ohne Namensänderung würde sonst den kuratierten
 * Namen einer Template-Kategorie durch die gerade angezeigte Übersetzung überschreiben. Anzeigestellen
 * müssen stattdessen `translateCategoryName()` verwenden.
 */
export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: () => listCategories(false) });
}

export interface CategoryOption {
  category: Category;
  label: string;
}

/** Gruppierte Optionen: Oberkategorie als Gruppentitel, beide Ebenen wählbar. */
export function groupCategories(categories: Category[]): { parent: Category; options: CategoryOption[] }[] {
  const topLevel = categories.filter((c) => c.parent_id === null);
  return topLevel.map((parent) => {
    const children = categories.filter((c) => c.parent_id === parent.id);
    const parentLabel = translateCategoryName(parent);
    return {
      parent,
      options: [
        { category: parent, label: parentLabel },
        ...children.map((c) => ({ category: c, label: `${parentLabel} · ${translateCategoryName(c)}` })),
      ],
    };
  });
}
