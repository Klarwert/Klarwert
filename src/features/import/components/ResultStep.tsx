import { formatEur } from "@/lib/money";
import type { RunImportResult, MultiAccountImportResult } from "@/lib/import/runImport";
import type { Asset } from "@/db/types";

interface ResultStepProps {
  t: any;
  result: RunImportResult | null;
  multiResult: MultiAccountImportResult | null;
  accountAssets: Asset[];
}

export function ResultStep({ t, result, multiResult, accountAssets }: ResultStepProps) {
  if (result) {
    return (
      <div className="space-y-3 text-sm">
        {result.status === "failed" ? (
          <div className="rounded-klein bg-brick/10 p-3 text-brick">
            {t("import.result.failed", { error: result.errorMessage })}
            <br />
            {t("import.result.unchanged")}
          </div>
        ) : (
          <ul className="space-y-1">
            <li>{t("import.result.rowsRead", { count: result.rowsRead })}</li>
            <li>{t("import.result.rowsNew", { count: result.rowsNew })}</li>
            <li>{t("import.result.rowsUpdated", { count: result.rowsUpdated })}</li>
            <li>{t("import.result.rowsSkipped", { count: result.rowsSkipped })}</li>
            <li>{t("import.result.rowsAutoCategorized", { count: result.rowsAutoCategorized, total: result.rowsRead })}</li>
            {result.transfersFound > 0 && <li>{t("import.result.transfersFound", { count: result.transfersFound })}</li>}
            {result.rowsIgnoredOtherAccount > 0 && (
              <li>{t("import.result.rowsIgnoredOtherAccount", { count: result.rowsIgnoredOtherAccount })}</li>
            )}
            {result.balanceUnconfirmed && (
              <li className="text-gold">{t("import.result.balanceUnconfirmed")}</li>
            )}
            {result.balanceMismatchCents !== null && (
              <li className="text-brick">{t("import.result.balanceMismatch", { amount: formatEur(result.balanceMismatchCents) })}</li>
            )}
            {result.lostMetadataCount > 0 && (
              <li className="text-gold">{t("import.result.lostMetadataCount", { count: result.lostMetadataCount })}</li>
            )}
          </ul>
        )}
      </div>
    );
  }

  if (multiResult) {
    return (
      <div className="space-y-3 text-sm">
        {multiResult.status === "failed" ? (
          <div className="rounded-klein bg-brick/10 p-3 text-brick">
            {t("import.result.failed", { error: multiResult.errorMessage })}
            <br />
            {t("import.result.unchanged")}
          </div>
        ) : (
          <ul className="space-y-2">
            {multiResult.perAccount.map((acc) => (
              <li key={acc.assetId} className="rounded-klein border border-border p-2">
                <p className="font-medium text-charcoal">
                  {accountAssets.find((a) => a.id === acc.assetId)?.name ?? acc.label}
                </p>
                <p className="text-xs text-slate">
                  {t("import.result.multiAccountSummary", {
                    new: acc.rowsNew,
                    updated: acc.rowsUpdated,
                    skipped: acc.rowsSkipped,
                    categorized: acc.rowsAutoCategorized,
                  })}
                  {acc.transfersFound > 0 ? t("import.result.multiAccountTransfers", { count: acc.transfersFound }) : ""}
                </p>
                {acc.balanceUnconfirmed && (
                  <p className="text-xs text-gold">{t("import.result.balanceUnconfirmed")}</p>
                )}
              </li>
            ))}
            {multiResult.rowsIgnoredUnmapped > 0 && (
              <li className="text-xs text-gold">
                {t("import.result.rowsIgnoredUnmapped", { count: multiResult.rowsIgnoredUnmapped })}
              </li>
            )}
          </ul>
        )}
      </div>
    );
  }

  return null;
}
