import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NetWorthLineChart } from "@/components/charts/NetWorthLineChart";
import { AssetListRow } from "@/features/vermoegen/components/AssetListRow";
import { CreateAssetModal } from "@/features/vermoegen/components/CreateAssetModal";
import { EditAssetModal } from "@/features/vermoegen/components/EditAssetModal";
import { UpdateValueModal } from "@/features/vermoegen/components/UpdateValueModal";
import { ImportWizard } from "@/features/import/ImportWizard";
import { DepotPositionList } from "@/features/depot/components/DepotPositionList";
import { useAssets } from "@/hooks/useAssets";
import { usePersons } from "@/hooks/usePersons";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGlobalFilterStore } from "@/stores/globalFilterStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useUiStore } from "@/stores/uiStore";
import {
  countAssetTransactions,
  deleteAsset,
  type AssetWithOwners,
} from "@/db/repositories/assets";
import {
  getAccountSparkline,
  getAssetIdsWithAnchor,
  getCurrentBalances,
  getNetWorthSeries,
} from "@/db/repositories/networth";
import { addHistoryEntry } from "@/db/repositories/historyLog";
import { formatEur } from "@/lib/money";
import { todayIso } from "@/lib/dates";
import { toast } from "sonner";

const ACCOUNT_TYPE_ORDER: Record<string, number> = {
  giro: 1,
  tagesgeld: 2,
  kreditkarte: 3,
  depot: 4,
  darlehen: 5,
};
const VALUABLE_TYPE_ORDER: Record<string, number> = {
  bausparvertrag: 1,
  bargeld: 2,
  sonstiges: 3,
};

function sortAssets(assets: AssetWithOwners[], balances: Map<number, number>): AssetWithOwners[] {
  return [...assets].sort((a, b) => {
    const kindDiff = (a.kind === "valuable" ? 1 : 0) - (b.kind === "valuable" ? 1 : 0);
    if (kindDiff !== 0) return kindDiff;
    const typeOrderA =
      a.kind === "account" ? ACCOUNT_TYPE_ORDER[a.account_type ?? ""] ?? 99 : VALUABLE_TYPE_ORDER[a.valuable_type ?? ""] ?? 99;
    const typeOrderB =
      b.kind === "account" ? ACCOUNT_TYPE_ORDER[b.account_type ?? ""] ?? 99 : VALUABLE_TYPE_ORDER[b.valuable_type ?? ""] ?? 99;
    if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
    return (balances.get(b.id) ?? 0) - (balances.get(a.id) ?? 0);
  });
}

export function VermoegenPage() {
  const { t } = useTranslation(["vermoegen", "app"]);
  const queryClient = useQueryClient();
  const { data: assets, isLoading } = useAssets(true);
  const { data: persons } = usePersons();
  const importReminderDays = useSettingsStore((s) => s.importReminderDays);
  const selectedAccountId = useGlobalFilterStore((s) => s.selectedAccountId);
  const selectedPersonId = useGlobalFilterStore((s) => s.selectedPersonId);
  const setSelectedAccountId = useGlobalFilterStore((s) => s.setSelectedAccountId);
  const navigate = useNavigationStore((s) => s.navigate);

  const pendingOpenCreateAsset = useUiStore((s) => s.pendingOpenCreateAsset);
  const pendingAssetPrefill = useUiStore((s) => s.pendingAssetPrefill);
  const consumeOpenCreateAssetRequest = useUiStore((s) => s.consumeOpenCreateAssetRequest);

  const [createOpen, setCreateOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<AssetWithOwners | null>(null);
  const [valueAsset, setValueAsset] = useState<AssetWithOwners | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ asset: AssetWithOwners; count: number } | null>(
    null,
  );
  const [importAssetId, setImportAssetId] = useState<number | null>(null);
  const [editImportFormatAssetId, setEditImportFormatAssetId] = useState<number | null>(null);

  const [createAssetPrefill, setCreateAssetPrefill] = useState<typeof pendingAssetPrefill>(null);

  useEffect(() => {
    if (pendingOpenCreateAsset) {
      setCreateAssetPrefill(pendingAssetPrefill);
      setCreateOpen(true);
      consumeOpenCreateAssetRequest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenCreateAsset, consumeOpenCreateAssetRequest]);

  // Globalfilter (2.2): Personen-Filter reduziert Liste+Summe, Konto-Filter macht die Seite
  // zur Detailansicht genau dieses einen Kontos.
  const filteredAssets = useMemo(() => {
    if (!assets) return [];
    let list = assets;
    if (selectedPersonId) list = list.filter((a) => a.owner_ids.includes(selectedPersonId));
    if (selectedAccountId) list = list.filter((a) => a.id === selectedAccountId);
    return list;
  }, [assets, selectedPersonId, selectedAccountId]);

  const assetIds = useMemo(() => filteredAssets.map((a) => a.id), [filteredAssets]);

  const { data: balances } = useQuery({
    queryKey: ["asset-balances", assetIds],
    queryFn: () => getCurrentBalances(filteredAssets),
    enabled: filteredAssets.length > 0,
  });

  const { data: anchorIds } = useQuery({
    queryKey: ["asset-anchors", assetIds],
    queryFn: getAssetIdsWithAnchor,
    enabled: filteredAssets.length > 0,
  });

  const { data: netWorthSeries } = useQuery({
    queryKey: ["net-worth-series", assetIds],
    queryFn: () => getNetWorthSeries(filteredAssets, 12),
    enabled: filteredAssets.length > 0,
  });

  const { data: sparklines } = useQuery({
    queryKey: ["asset-sparklines", assetIds],
    queryFn: async () => {
      const accountIds = filteredAssets.filter((a) => a.kind === "account").map((a) => a.id);
      const entries = await Promise.all(
        accountIds.map(async (id) => [id, await getAccountSparkline(id)] as const),
      );
      return Object.fromEntries(entries);
    },
    enabled: filteredAssets.length > 0,
  });

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
    void queryClient.invalidateQueries({ queryKey: ["asset-balances"] });
    void queryClient.invalidateQueries({ queryKey: ["asset-anchors"] });
    void queryClient.invalidateQueries({ queryKey: ["net-worth-series"] });
    void queryClient.invalidateQueries({ queryKey: ["asset-sparklines"] });
  }

  async function handleDeleteClick(asset: AssetWithOwners) {
    const count = await countAssetTransactions(asset.id);
    setDeleteTarget({ asset, count });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { asset, count } = deleteTarget;
    await deleteAsset(asset.id);
    await addHistoryEntry({
      action_type: "asset_delete",
      description: t("deletedAccount", { name: asset.name, count }),
      payload: { assetId: asset.id },
    });
    toast.success(t("deleted", { name: asset.name }), {
      description: t("transactionsAffected", { count }),
    });
    invalidateAll();
  }

  const sorted = useMemo(() => (balances ? sortAssets(filteredAssets, balances) : []), [balances, filteredAssets]);
  const totalCents = sorted.reduce((sum, a) => sum + (balances?.get(a.id) ?? 0), 0);

  const staleAssetIds = useMemo(() => {
    if (importReminderDays <= 0) return new Set<number>();
    const today = todayIso();
    const set = new Set<number>();
    for (const a of sorted) {
      if (a.kind !== "account" || !a.last_import_at) continue;
      const daysSince =
        (new Date(today).getTime() - new Date(a.last_import_at.slice(0, 10)).getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysSince > importReminderDays) set.add(a.id);
    }
    return set;
  }, [sorted, importReminderDays]);

  const defaultImportAssetId = selectedAccountId ?? assets?.find((a) => a.kind === "account")?.id ?? null;

  if (isLoading) {
    return <p className="text-sm text-slate">{t("app:common.loading")}</p>;
  }

  if (!assets || assets.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div>
          <h1 className="font-heading text-xl text-charcoal">{t("noAccounts")}</h1>
          <p className="mt-1 text-sm text-slate">
            {t("noAccountsDesc")}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          {t("addAsset")}
        </Button>
        <CreateAssetModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id, kind) => {
            invalidateAll();
            if (kind === "account") setImportAssetId(id);
          }}
        />
        {importAssetId !== null && (
          <ImportWizard
            open={importAssetId !== null}
            assetId={importAssetId}
            onOpenChange={(o) => !o && setImportAssetId(null)}
            onCompleted={invalidateAll}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl text-charcoal">{t("title")}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate">
            <span>{t("assetCount", { count: sorted.length })}</span>
            <span aria-hidden="true">·</span>
            <span className="num">{formatEur(totalCents)}</span>
            <span aria-hidden="true">·</span>
            <span>{t("balanceCheck")}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {defaultImportAssetId !== null && (
            <Button variant="ghost" onClick={() => setImportAssetId(defaultImportAssetId)}>
              <Upload className="mr-1.5 size-4" />
              {t("importFile")}
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            {t("addAsset")}
          </Button>
        </div>
      </div>

      <div className="rounded-standard border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-charcoal">{t("netWorthHistory")}</h2>
        {netWorthSeries && <NetWorthLineChart data={netWorthSeries} />}
      </div>

      <div className="rounded-standard border border-border bg-card p-2">
        {sorted.map((asset) => {
          const balanceCents = balances?.get(asset.id) ?? 0;
          const isDepot = asset.account_type === "depot";
          // Ein Depot hat keinen manuell bestätigten Kontostand - der Wert ergibt sich live aus
          // depot_positions × Kurs (siehe depotValueAt() in networth.ts), ein "Abweichung vom
          // bestätigten Saldo"-Hinweis wäre hier bei jeder Kursbewegung irreführend.
          const mismatch =
            asset.kind === "account" &&
            !isDepot &&
            asset.last_confirmed_balance_cents !== null &&
            asset.last_confirmed_balance_cents !== undefined &&
            Math.abs(balanceCents - asset.last_confirmed_balance_cents) >= 1;
          return (
            <div key={asset.id}>
              <AssetListRow
                asset={asset}
                balanceCents={balanceCents}
                sparklineValues={isDepot ? [] : (sparklines?.[asset.id] ?? [])}
                persons={persons ?? []}
                isStale={staleAssetIds.has(asset.id)}
                hasAnchor={asset.kind === "valuable" || isDepot || (anchorIds?.has(asset.id) ?? false)}
                onRowClick={asset.kind === "account" ? () => {
                  setSelectedAccountId(asset.id);
                  navigate("transaktionen");
                } : undefined}
                onEdit={() => setEditAsset(asset)}
                onDelete={() => void handleDeleteClick(asset)}
                onUpdateValue={() => setValueAsset(asset)}
                onNewImport={() => setImportAssetId(asset.id)}
                onEditImportFormat={() => setEditImportFormatAssetId(asset.id)}
              />
              {mismatch && (
                <div className="mx-3 mb-2 rounded-klein bg-brick/10 px-3 py-2 text-xs text-brick">
                  {t("balanceMismatch", {
                    calculated: formatEur(balanceCents),
                    confirmed: formatEur(asset.last_confirmed_balance_cents!),
                    diff: formatEur(balanceCents - asset.last_confirmed_balance_cents!),
                  })}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setValueAsset(asset)}
                  >
                    {t("updateNow")}
                  </button>
                </div>
              )}
              {/* Depot: show positions inline below the row */}
              {asset.account_type === "depot" && (
                <div className="mx-3 mb-3 rounded-standard border border-border/50 bg-paper p-4">
                  <DepotPositionList assetId={asset.id} />
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="p-3 text-sm text-slate">{t("noAccountsFilter")}</p>
        )}
      </div>

      <CreateAssetModal
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateAssetPrefill(null);
        }}
        initial={createAssetPrefill ?? undefined}
        onCreated={(id, kind) => {
          invalidateAll();
          if (kind === "account") setImportAssetId(id);
        }}
      />
      {importAssetId !== null && (
        <ImportWizard
          open={importAssetId !== null}
          assetId={importAssetId}
          onOpenChange={(o) => !o && setImportAssetId(null)}
          onCompleted={invalidateAll}
        />
      )}
      {editImportFormatAssetId !== null && (
        <ImportWizard
          open={editImportFormatAssetId !== null}
          assetId={editImportFormatAssetId}
          onOpenChange={(o) => !o && setEditImportFormatAssetId(null)}
          onCompleted={invalidateAll}
          forceMappingMode={true}
        />
      )}
      <EditAssetModal
        asset={editAsset}
        onOpenChange={(open) => !open && setEditAsset(null)}
        onSaved={invalidateAll}
      />
      <UpdateValueModal
        asset={valueAsset}
        onOpenChange={(open) => !open && setValueAsset(null)}
        onSaved={invalidateAll}
      />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={`"${deleteTarget.asset.name}" ${t("app:common.delete")}?`}
          description={t("transactionsAffected", { count: deleteTarget.count })}
          confirmLabel={t("app:common.delete")}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}
    </div>
  );
}
