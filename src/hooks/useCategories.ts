import { useQuery } from "@tanstack/react-query";
import { listCategories } from "@/db/repositories/categories";
import type { Category } from "@/db/types";

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
    return {
      parent,
      options: [
        { category: parent, label: parent.name },
        ...children.map((c) => ({ category: c, label: `${parent.name} · ${c.name}` })),
      ],
    };
  });
}
