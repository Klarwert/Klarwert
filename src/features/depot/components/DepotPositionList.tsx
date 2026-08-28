/**
 * DepotPositionList – zeigt alle Positionen eines Depot-Kontos mit aktuellem Kurs.
 * Kurse werden über den konfigurierten PriceProvider abgerufen (max. 1×/Tag pro ISIN).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, RefreshCw, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import {
  listDepotPositions,
  deleteDepotPosition,
} from "@/db/repositories/depot";
import { fetchLatestPrices } from "@/lib/quotes";
import type { DepotPosition } from "@/db/types";
import { formatEur } from "@/lib/money";
import { DepotPositionModal } from "./DepotPositionModal";

interface DepotPositionListProps {
  assetId: number;
}

function calcCurrentValueCents(
  sharesAmount: string,
  priceCents: number
): number {
  const shares = parseFloat(sharesAmount.replace(",", "."));
  return isNaN(shares) ? 0 : Math.round(shares * priceCents);
}

function gainPercent(currentCents: number, purchaseCents: number): number {
  if (purchaseCents === 0) return 0;
  return ((currentCents - purchaseCents) / purchaseCents) * 100;
}

export function DepotPositionList({ assetId }: DepotPositionListProps) {
  const { t } = useTranslation("depot");
  const [positions, setPositions] = useState<DepotPosition[]>([]);
  const [prices, setPrices] = useState<Map<string, { priceCents: number; currency: string; date: string; source: string }>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [editPosition, setEditPosition] = useState<DepotPosition | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    const pos = await listDepotPositions(assetId);
    setPositions(pos);
    return pos;
  }

  async function refreshPrices(pos: DepotPosition[]) {
    if (pos.length === 0) return;
    setLoadingPrices(true);
    try {
      const isins = [...new Set(pos.map((p) => p.isin))];
      const result = await fetchLatestPrices(isins);
      setPrices(result);
    } catch (e) {
      console.warn("[Depot] price fetch failed:", e);
    } finally {
      setLoadingPrices(false);
    }
  }

  useEffect(() => {
    void load().then(refreshPrices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  async function handleDelete(position: DepotPosition) {
    try {
      await deleteDepotPosition(position.id);
      toast.success(t("deleted", { name: position.name }));
      const updated = await load();
      void refreshPrices(updated);
    } catch (e) {
      showErrorToast(t("deleteFailed", { error: String(e) }));
    }
  }

  const totalPurchaseCents = positions.reduce(
    (sum, p) => sum + Math.round(parseFloat(p.shares_amount.replace(",", ".")) * p.purchase_price_cents),
    0
  );
  const totalCurrentCents = positions.reduce((sum, p) => {
    const price = prices.get(p.isin);
    if (!price) return sum + Math.round(parseFloat(p.shares_amount.replace(",", ".")) * p.purchase_price_cents);
    return sum + calcCurrentValueCents(p.shares_amount, price.priceCents);
  }, 0);
  const totalGain = gainPercent(totalCurrentCents, totalPurchaseCents);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-charcoal">
            {t("positions", { count: positions.length })}
          </p>
          {positions.length > 0 && (
            <p className="text-xs text-slate">
              {t("purchaseValue", { purchase: formatEur(totalPurchaseCents), current: formatEur(totalCurrentCents) })}
              <span className={`ml-2 font-medium ${totalGain >= 0 ? "text-sage" : "text-brick"}`}>
                {totalGain >= 0 ? "+" : ""}{totalGain.toFixed(2)} %
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load().then(refreshPrices)}
            disabled={loadingPrices}
            title={t("refreshPrices")}
          >
            {loadingPrices ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-3.5" />
            {t("addPosition")}
          </Button>
        </div>
      </div>

      {/* Position list */}
      {positions.length === 0 ? (
        <p className="text-sm text-slate py-4 text-center">{t("empty")}</p>
      ) : (
        <div className="rounded-standard border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate text-xs">{t("columns.security")}</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate text-xs">{t("columns.isin")}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate text-xs">{t("columns.shares")}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate text-xs">{t("columns.purchasePrice")}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate text-xs">{t("columns.price")}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate text-xs">{t("columns.value")}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate text-xs">{t("columns.gain")}</th>
                <th className="w-16 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const price = prices.get(p.isin);
                const currentPriceCents = price?.priceCents ?? p.purchase_price_cents;
                const currentValueCents = calcCurrentValueCents(p.shares_amount, currentPriceCents);
                const purchaseValueCents = Math.round(parseFloat(p.shares_amount.replace(",", ".")) * p.purchase_price_cents);
                const gain = gainPercent(currentValueCents, purchaseValueCents);
                const hasPrice = !!price;

                return (
                  <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3 font-medium text-charcoal">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate">{p.isin}</td>
                    <td className="px-4 py-3 text-right text-slate">{p.shares_amount}</td>
                    <td className="px-4 py-3 text-right text-slate num">{formatEur(p.purchase_price_cents)}</td>
                    <td className="px-4 py-3 text-right num">
                      {hasPrice ? (
                        <span className="text-charcoal">{formatEur(currentPriceCents)}</span>
                      ) : (
                        <span className="text-slate italic text-xs">–</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right num font-medium text-charcoal">
                      {formatEur(currentValueCents)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {hasPrice ? (
                        <span className={`flex items-center justify-end gap-0.5 text-xs font-medium ${gain >= 0 ? "text-sage" : "text-brick"}`}>
                          {gain >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                          {gain >= 0 ? "+" : ""}{gain.toFixed(2)} %
                        </span>
                      ) : (
                        <span className="text-slate text-xs">–</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditPosition(p)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-brick hover:text-brick"
                          onClick={() => void handleDelete(p)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Price source note */}
      {prices.size > 0 && (
        <p className="text-xs text-slate">
          {t("priceDate", { date: prices.values().next().value?.date ?? "–" })}
          {loadingPrices && t("priceUpdating")}
        </p>
      )}

      {/* Modals */}
      <DepotPositionModal
        open={createOpen || !!editPosition}
        assetId={assetId}
        position={editPosition ?? undefined}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditPosition(null);
          }
        }}
        onSaved={() => {
          void load().then(refreshPrices);
          setCreateOpen(false);
          setEditPosition(null);
        }}
      />
    </div>
  );
}
