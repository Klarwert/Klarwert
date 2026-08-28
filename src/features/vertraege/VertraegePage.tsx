import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useContracts, useRecurringPayments } from "@/hooks/useContracts";
import { CategorySelect } from "@/components/CategorySelect";
import { ContractDrawer } from "@/features/vertraege/components/ContractDrawer";
import { dismissRecurringPayment, renameRecurringPayment, updateRecurringPaymentCategory, upgradeToContract } from "@/db/repositories/recurringPayments";
import { formatEur } from "@/lib/money";
import type { Contract, ContractStatus } from "@/db/types";
import { toast } from "sonner";


const STATUS_ORDER: Record<ContractStatus, number> = {
  price_changed: 0,
  detected: 1,
  confirmed: 2,
  paused: 3,
  suggested_ended: 4,
  ended: 5,
};

const STATUS_COLOR: Record<ContractStatus, string> = {
  detected: "bg-brick text-card hover:bg-brick",
  confirmed: "bg-sage text-card hover:bg-sage",
  price_changed: "bg-gold text-charcoal hover:bg-gold",
  paused: "bg-slate text-card hover:bg-slate",
  suggested_ended: "bg-amber-500 text-card hover:bg-amber-600",
  ended: "bg-slate text-card hover:bg-slate",
};

export function VertraegePage() {
  const { t } = useTranslation(["vertraege", "app"]);
  const queryClient = useQueryClient();
  const { data: contracts } = useContracts();
  const { data: recurringPayments } = useRecurringPayments();
  const [view, setView] = useState<"contracts" | "archive" | "recurring">("contracts");
  const [search, setSearch] = useState("");
  const [drawerContract, setDrawerContract] = useState<Contract | "new" | null>(null);

  const currentDrawerContract = useMemo(() => {
    if (drawerContract === "new" || drawerContract === null) return drawerContract;
    return contracts?.find((c) => c.id === drawerContract.id) ?? drawerContract;
  }, [drawerContract, contracts]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["contracts"] });
    void queryClient.invalidateQueries({ queryKey: ["recurring-payments"] });
  }

  const filteredContracts = useMemo(() => {
    const list = (contracts ?? [])
      .filter((c) => c.status !== "ended" && c.current_amount_cents !== 0)
      .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.current_amount_cents - a.current_amount_cents,
    );
  }, [contracts, search]);

  const filteredArchive = useMemo(() => {
    const list = (contracts ?? [])
      .filter((c) => c.status === "ended" && c.current_amount_cents !== 0)
      .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => b.current_amount_cents - a.current_amount_cents);
  }, [contracts, search]);

  const filteredRecurring = useMemo(
    () =>
      (recurringPayments ?? []).filter(
        (r) => r.typical_amount_cents !== 0 && r.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [recurringPayments, search],
  );

  const activeContracts = useMemo(
    () => (contracts ?? []).filter((c) => c.current_amount_cents !== 0),
    [contracts],
  );

  const monthlyFixedCosts = activeContracts
    .filter((c) => c.status === "confirmed" || c.status === "price_changed")
    .reduce((sum, c) => sum + (c.interval === "yearly" ? c.current_amount_cents / 12 : c.current_amount_cents), 0);

  async function handleUpgrade(id: number, categoryId: number | null) {
    await upgradeToContract(id, categoryId);
    toast.success(t("upgraded"));
    invalidate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl text-charcoal">{t("title")}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate">
            <span>{t("count", { count: activeContracts.length })}</span>
            <span aria-hidden="true">·</span>
            <span className="num">{t("fixedCosts", { amount: formatEur(Math.round(monthlyFixedCosts)) })}</span>
          </div>
        </div>
        <Button onClick={() => setDrawerContract("new")}>
          <Plus className="mr-2 size-4" />
          {t("add")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" className="inline-flex rounded-klein border border-border">
          {(["contracts", "archive", "recurring"] as const).map((v, i) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm transition-colors ${i > 0 ? "border-l border-border" : ""} ${
                view === v ? "bg-petrol text-card" : "text-charcoal hover:bg-accent"
              }`}
            >
              {v === "contracts" ? t("views.contracts") : v === "archive" ? t("views.archive") : t("views.recurring")}
            </button>
          ))}
        </div>
        <Input
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {view === "contracts" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredContracts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setDrawerContract(c)}
              className="rounded-standard border border-border bg-card p-4 text-left hover:bg-accent"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-charcoal">{c.name}</span>
                <Badge className={STATUS_COLOR[c.status]}>{t(`status.${c.status}`)}</Badge>
              </div>
              <div className="num mt-2 text-lg text-charcoal">{formatEur(c.current_amount_cents)}</div>
              {c.previous_amount_cents !== null && (
                <div className="num text-xs text-gold">{t("previousAmount", { amount: formatEur(c.previous_amount_cents) })}</div>
              )}
            </button>
          ))}
          {filteredContracts.length === 0 && (
            <p className="col-span-full text-sm text-slate">{t("noActive")}</p>
          )}
        </div>
      )}

      {view === "archive" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredArchive.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setDrawerContract(c)}
              className="rounded-standard border border-border bg-card p-4 text-left hover:bg-accent opacity-75 grayscale transition-all hover:grayscale-0 hover:opacity-100"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-charcoal">{c.name}</span>
                <Badge className={STATUS_COLOR[c.status]}>{t(`status.${c.status}`)}</Badge>
              </div>
              <div className="num mt-2 text-lg text-charcoal">{formatEur(c.current_amount_cents)}</div>
            </button>
          ))}
          {filteredArchive.length === 0 && (
            <p className="col-span-full text-sm text-slate">{t("noArchive")}</p>
          )}
        </div>
      )}

      {view === "recurring" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRecurring.map((r) => (
            <div key={r.id} className="rounded-standard border border-border bg-card p-4">
              <Input
                defaultValue={r.name}
                className="mb-2 h-7 border-none px-0 text-sm font-medium"
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== r.name) {
                    void renameRecurringPayment(r.id, e.target.value.trim()).then(invalidate);
                  }
                }}
              />
              <div className="num text-lg text-charcoal">{formatEur(r.typical_amount_cents)}</div>
              <div className="my-2">
                <CategorySelect
                  value={r.category_id}
                  onChange={(v) => void updateRecurringPaymentCategory(r.id, v).then(invalidate)}
                />
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void dismissRecurringPayment(r.id).then(invalidate)}
                >
                  {t("dismiss")}
                </Button>
                <Button size="sm" onClick={() => void handleUpgrade(r.id, r.category_id)}>
                  {t("upgrade")}
                </Button>
              </div>
            </div>
          ))}
          {filteredRecurring.length === 0 && (
            <p className="col-span-full text-sm text-slate">{t("noRecurring")}</p>
          )}
        </div>
      )}

      <ContractDrawer contract={currentDrawerContract} onOpenChange={(o) => !o && setDrawerContract(null)} onChanged={invalidate} />
    </div>
  );
}
