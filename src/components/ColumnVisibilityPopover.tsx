import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OptionalColumn } from "@/hooks/useColumnVisibility";

interface ColumnVisibilityPopoverProps {
  columns: OptionalColumn[];
  visible: Set<string>;
  onToggle: (key: string) => void;
}

/**
 * Übersetzt eine Spalten-Bezeichnung: bekannte Bank-Spaltenrollen über app:import.roles.<key>
 * (dieselbe Liste wie im Import-Assistenten), "asset_name" separat, alles andere (z. B.
 * unbekannte Extra-Felder aus Community-Bankvorlagen) fällt auf das mitgelieferte `label` zurück.
 */
function translateColumnLabel(t: any, col: OptionalColumn): string {
  if (col.key === "asset_name") return t("transaktionen:columnVisibility.sourceAccount", col.label);
  return t(`app:import.roles.${col.key}`, col.label);
}

/** B3b Spalten-Auswahl. `columns` enthält feste Kernspalten + dynamisch ermittelte Extra-Felder. */
export function ColumnVisibilityPopover({ columns, visible, onToggle }: ColumnVisibilityPopoverProps) {
  const { t } = useTranslation(["transaktionen", "app"]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("columnVisibility.ariaLabel")}>
          <Eye className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60" role="menu">
        <div className="space-y-2">
          {columns.length === 0 && <p className="text-xs text-slate">{t("columnVisibility.noExtraColumns")}</p>}
          {columns.map((col) => (
            <label key={col.key} className="flex items-center gap-2 text-sm">
              <Checkbox checked={visible.has(col.key)} onCheckedChange={() => onToggle(col.key)} />
              {translateColumnLabel(t, col)}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
