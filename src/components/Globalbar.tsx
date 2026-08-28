import { Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGlobalFilterStore } from "@/stores/globalFilterStore";
import { usePersons } from "@/hooks/usePersons";
import { useAssets } from "@/hooks/useAssets";
import { NotificationBellPopover } from "@/features/benachrichtigungen/NotificationBellPopover";
import { useTranslation } from "react-i18next";

const ALL = "all";

export function Globalbar() {
  const { t } = useTranslation("app");
  const { data: assets } = useAssets(false);
  const { data: persons } = usePersons();
  const selectedAccountId = useGlobalFilterStore((s) => s.selectedAccountId);
  const selectedPersonId = useGlobalFilterStore((s) => s.selectedPersonId);
  const setSelectedAccountId = useGlobalFilterStore((s) => s.setSelectedAccountId);
  const setSelectedPersonId = useGlobalFilterStore((s) => s.setSelectedPersonId);

  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-6 py-3">
      <Select
        value={selectedAccountId ? String(selectedAccountId) : ALL}
        onValueChange={(v) => setSelectedAccountId(v === ALL ? null : Number(v))}
      >
        <SelectTrigger className="w-[180px]" aria-label={t("globalbar.accountFilter")}>
          <SelectValue placeholder={t("globalbar.allAccounts")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("globalbar.allAccounts")}</SelectItem>
          {assets?.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedPersonId ? String(selectedPersonId) : ALL}
        onValueChange={(v) => setSelectedPersonId(v === ALL ? null : Number(v))}
      >
        <SelectTrigger className="w-[160px]" aria-label={t("globalbar.personFilter")}>
          <SelectValue placeholder={t("globalbar.allPersons")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("globalbar.allPersons")}</SelectItem>
          {persons?.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex size-6 items-center justify-center rounded-full text-slate">
            <Info className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px]">
          {t("globalbar.filterHint")}
        </TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-1">
        <NotificationBellPopover />
      </div>
    </div>
  );
}
