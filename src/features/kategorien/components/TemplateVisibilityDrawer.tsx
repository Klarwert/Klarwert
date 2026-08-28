import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCategories } from "@/hooks/useCategories";
import { setCategoryHidden } from "@/db/repositories/categories";
import { useQueryClient } from "@tanstack/react-query";

interface TemplateVisibilityDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateVisibilityDrawer({ open, onOpenChange }: TemplateVisibilityDrawerProps) {
  const { t } = useTranslation("kategorien");
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const templates = (categories ?? []).filter((c) => c.is_template === 1 && c.is_system === 0);
  const topLevel = templates.filter((c) => c.parent_id === null);

  async function toggle(id: number, hidden: boolean) {
    await setCategoryHidden(id, hidden);
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[430px] overflow-y-auto sm:max-w-[430px]">
        <SheetHeader>
          <SheetTitle>{t("categories.manageTemplates")}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {topLevel.map((parent) => (
            <div key={parent.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`cat-vis-${parent.id}`} className="font-medium text-charcoal">
                  {parent.name}
                </Label>
                <Switch
                  id={`cat-vis-${parent.id}`}
                  checked={parent.is_hidden === 0}
                  onCheckedChange={(checked) => void toggle(parent.id, !checked)}
                />
              </div>
              {templates
                .filter((c) => c.parent_id === parent.id)
                .map((child) => (
                  <div key={child.id} className="ml-4 flex items-center justify-between">
                    <Label htmlFor={`cat-vis-${child.id}`} className="text-sm text-slate">
                      {child.name}
                    </Label>
                    <Switch
                      id={`cat-vis-${child.id}`}
                      checked={child.is_hidden === 0}
                      onCheckedChange={(checked) => void toggle(child.id, !checked)}
                    />
                  </div>
                ))}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
