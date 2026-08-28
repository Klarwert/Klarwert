import {
  LayoutDashboard,
  Wallet,
  Receipt,
  Tags,
  FileText,
  FolderKanban,
  Target,
  Landmark,
  Calculator,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigationStore, type PageKey } from "@/stores/navigationStore";
import { usePersons } from "@/hooks/usePersons";
import { KlarwertLogo } from "@/components/KlarwertMark";

interface NavItemDef {
  key: PageKey;
  label: string;
  icon: typeof Wallet;
}

import { useTranslation } from "react-i18next";

export function Sidebar() {
  const { t } = useTranslation("app");
  const currentPage = useNavigationStore((s) => s.currentPage);
  const navigate = useNavigationStore((s) => s.navigate);
  const { data: persons } = usePersons();
  const householdLabel =
    persons && persons.length > 0
      ? persons.length === 1
        ? persons[0].name
        : `${persons[0].name} +${persons.length - 1}`
      : t("nav.haushalt");

  const GROUPS: { title: string; items: NavItemDef[] }[] = [
    {
      title: t("nav.erfassen"),
      items: [
        { key: "uebersicht", label: t("nav.uebersicht"), icon: LayoutDashboard },
        { key: "vermoegen", label: t("nav.vermoegen"), icon: Wallet },
        { key: "transaktionen", label: t("nav.transaktionen"), icon: Receipt },
      ],
    },
    {
      title: t("nav.ordnen"),
      items: [
        { key: "kategorien", label: t("nav.kategorien"), icon: Tags },
        { key: "vertraege", label: t("nav.vertraege"), icon: FileText },
        { key: "sammlungen", label: t("nav.sammlungen"), icon: FolderKanban },
      ],
    },
    {
      title: t("nav.planen"),
      items: [
        { key: "budgets", label: t("nav.budgets"), icon: Target },
        { key: "steuer", label: t("nav.steuer"), icon: Landmark },
        { key: "rechner", label: t("nav.rechner"), icon: Calculator },
      ],
    },
  ];


  return (
    <nav
      aria-label="Hauptnavigation"
      className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-card"
    >
      <div className="flex items-center px-5 pb-6 pt-5">
        <KlarwertLogo className="w-full" />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate">
              {group.title}
            </div>
            <ul>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = currentPage === item.key;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => navigate(item.key)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-klein px-2.5 py-2 text-sm text-charcoal transition-colors",
                        active
                          ? "bg-petrol text-card"
                          : "hover:bg-accent",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate("profil")}
        aria-current={currentPage === "profil" ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 border-t border-border px-5 py-4 text-sm text-charcoal transition-colors",
          currentPage === "profil" ? "bg-accent" : "hover:bg-accent",
        )}
      >
        <span className="inline-block size-2 rounded-full bg-sage" />
        <span className="flex-1 truncate text-left">{householdLabel}</span>
        <Settings className="size-4 text-slate" />
      </button>
    </nav>
  );
}
