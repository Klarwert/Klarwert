import { Pencil, Trash2, TriangleAlert, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/charts/Sparkline";
import { formatEur } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/lib/utils";
import type { AssetWithOwners } from "@/db/repositories/assets";
import type { Person } from "@/db/types";
import { useTranslation } from "react-i18next";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  giro: "Girokonto",
  tagesgeld: "Tagesgeld",
  kreditkarte: "Kreditkarte",
  depot: "Depot",
  darlehen: "Darlehen",
};

const VALUABLE_TYPE_LABELS: Record<string, string> = {
  bausparvertrag: "Bausparvertrag",
  bargeld: "Bargeld",
  sonstiges: "Sonstiges",
};

interface AssetListRowProps {
  asset: AssetWithOwners;
  balanceCents: number;
  sparklineValues: number[];
  persons: Person[];
  isStale: boolean;
  hasAnchor: boolean;
  onRowClick?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdateValue: () => void;
  onNewImport: () => void;
  onEditImportFormat?: () => void;
}

export function AssetListRow({
  asset,
  balanceCents,
  sparklineValues,
  persons,
  isStale,
  hasAnchor,
  onRowClick,
  onEdit,
  onDelete,
  onUpdateValue,
  onNewImport,
  onEditImportFormat,
}: AssetListRowProps) {
  const { t } = useTranslation(["vermoegen", "app"]);
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const typeLabel =
    asset.kind === "account"
      ? t(`vermoegen:accountType.${asset.account_type ?? ""}`, ACCOUNT_TYPE_LABELS[asset.account_type ?? ""])
      : t(`vermoegen:valuableType.${asset.valuable_type ?? ""}`, VALUABLE_TYPE_LABELS[asset.valuable_type ?? ""]);
  const ownerNames = persons
    .filter((p) => asset.owner_ids.includes(p.id))
    .map((p) => p.name)
    .join(", ");

  return (
    <div
      role={onRowClick ? "button" : undefined}
      tabIndex={onRowClick ? 0 : undefined}
      onClick={onRowClick}
      onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") onRowClick(); } : undefined}
      className={cn(
        "flex items-center gap-4 rounded-klein border border-transparent px-3 py-3",
        isStale && "border-gold/60 bg-gold/5",
        onRowClick && "cursor-pointer transition-colors hover:bg-accent",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-charcoal">{asset.name}</span>
          <Badge variant="outline" className="shrink-0 text-xs font-normal">
            {typeLabel}
          </Badge>
          {asset.kind === "account" && !hasAnchor && (
            <Badge className="shrink-0 bg-gold text-charcoal hover:bg-gold">
              {t("vermoegen:unconfirmedBalance")}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate">
          {ownerNames || t("vermoegen:noOwner")}
          {asset.kind === "account" && asset.account_type !== "depot" && (
            <>
              {" · "}
              {asset.last_import_at
                ? t("vermoegen:lastImported", { date: formatDate(asset.last_import_at.slice(0, 10), dateDisplayFormat) })
                : t("vermoegen:notImported")}
            </>
          )}
          {asset.account_type === "depot" && (
            <>
              {" · "}
              {t("vermoegen:depotLiveValue")}
            </>
          )}
        </div>
      </div>

      {asset.kind === "account" && <Sparkline values={sparklineValues} />}

      <div className="num w-28 shrink-0 text-right text-sm text-charcoal">
        {formatEur(balanceCents)}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {asset.kind === "account" && asset.account_type !== "depot" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onNewImport(); }}
            className={isStale ? "text-gold" : undefined}
          >
            {isStale && <TriangleAlert className="mr-1 size-3.5" />}
            Import
          </Button>
        )}
        {asset.kind === "valuable" && (
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onUpdateValue(); }}>
            {t("vermoegen:updateValueBtn")}
          </Button>
        )}
        <Button size="icon" variant="ghost" aria-label={t("app:common.edit")} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          <Pencil className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" aria-label={t("app:common.delete")} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <Trash2 className="size-4" />
        </Button>
        {asset.kind === "account" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={t("app:common.more")} onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditImportFormat?.(); }}>
                {t("vermoegen:editImportFormat")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
