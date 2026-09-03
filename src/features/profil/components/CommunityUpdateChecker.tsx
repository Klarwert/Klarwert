/**
 * CommunityUpdateChecker – lädt Händler und Bankprofile aus dem Community-Repo
 * (https://github.com/Klarwert/Klarwert-Community-Rules) und zeigt einen Diff an.
 *
 * Technisch: statischer Download von raw.githubusercontent.com, kein eigener Server,
 * kein Tracking. Nutzer entscheidet explizit vor dem Übernehmen (kein Auto-Update).
 */

import { useState } from "react";
import { Download, RefreshCw, Loader2, Users, Building2, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import { applyMerchantDataRelease, type MerchantDataRelease } from "@/db/repositories/merchants";
import { parseBankProfileRelease, applyBankProfileRelease } from "@/lib/import/bankProfileRelease";
import { COMMUNITY_MERCHANTS_URL, COMMUNITY_BANK_PROFILES_URL } from "@/lib/communityRules";
import { useTranslation } from "react-i18next";

export interface CommunityReleaseSummary {
  merchants: {
    source_version: string;
    count: number;
    release: MerchantDataRelease;
  } | null;
  bankProfiles: {
    source_version: string;
    count: number;
    raw: unknown;
  } | null;
}

export function CommunityUpdateChecker() {
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<CommunityReleaseSummary | null>(null);
  const [showMerchants, setShowMerchants] = useState(false);
  const [showBankProfiles, setShowBankProfiles] = useState(false);
  const { t } = useTranslation("profil");

  async function handleCheck() {
    setChecking(true);
    setSummary(null);
    try {
      const [merchantsRes, bankRes] = await Promise.allSettled([
        fetch(COMMUNITY_MERCHANTS_URL, { cache: "no-cache" }),
        fetch(COMMUNITY_BANK_PROFILES_URL, { cache: "no-cache" }),
      ]);

      let merchantsSummary: CommunityReleaseSummary["merchants"] = null;
      let bankSummary: CommunityReleaseSummary["bankProfiles"] = null;

      if (merchantsRes.status === "fulfilled" && merchantsRes.value.ok) {
        const release = (await merchantsRes.value.json()) as MerchantDataRelease;
        merchantsSummary = {
          source_version: release.source_version,
          count: release.merchants.length,
          release,
        };
      }

      if (bankRes.status === "fulfilled" && bankRes.value.ok) {
        const raw = await bankRes.value.json();
        bankSummary = {
          source_version: (raw as { source_version: string }).source_version,
          count: ((raw as { profiles: unknown[] }).profiles ?? []).length,
          raw,
        };
      }

      if (!merchantsSummary && !bankSummary) {
        const notFound =
          merchantsRes.status === "fulfilled" && merchantsRes.value.status === 404 &&
          bankRes.status === "fulfilled" && bankRes.value.status === 404;
        toast.info(notFound ? "Die Community-Datenbank ist noch im Aufbau." : "Community-Daten aktuell nicht abrufbar.");
        return;
      }

      setSummary({ merchants: merchantsSummary, bankProfiles: bankSummary });
    } catch (e) {
      toast.info("Community-Daten aktuell nicht abrufbar.");
      console.error(e);
    } finally {
      setChecking(false);
    }
  }

  async function handleApplyMerchants() {
    if (!summary?.merchants) return;
    setApplying(true);
    try {
      await applyMerchantDataRelease(summary.merchants.release);
      toast.success(
        t("community.merchantsSuccess", { count: summary.merchants.count, version: summary.merchants.source_version })
      );
      setSummary(null);
    } catch (e) {
      showErrorToast(`${t("community.merchantsError", { error: String(e) })}`);
    } finally {
      setApplying(false);
    }
  }

  async function handleApplyBankProfiles() {
    if (!summary?.bankProfiles) return;
    setApplying(true);
    try {
      const release = parseBankProfileRelease(summary.bankProfiles.raw);
      const result = await applyBankProfileRelease(release);
      const parts = [
        result.inserted > 0 && t("community.parts.new", { count: result.inserted }),
        result.updated > 0 && t("community.parts.updated", { count: result.updated }),
        result.skipped > 0 && t("community.parts.skipped", { count: result.skipped }),
      ].filter(Boolean).join(", ");
      toast.success(t("community.bankProfilesSuccess", { parts: parts || t("community.parts.none"), version: summary.bankProfiles.source_version }));
      setSummary(null);
    } catch (e) {
      showErrorToast(t("community.bankProfilesError", { error: String(e) }));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-slate">
          {t("community.desc")}
        </p>
      </div>

      <Button
        variant="outline"
        onClick={() => void handleCheck()}
        disabled={checking || applying}
      >
        {checking ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-1.5 size-4" />
        )}
        {t("community.check")}
      </Button>

      {summary && (
        <div className="space-y-3 rounded-standard border border-border bg-paper p-4">
          <p className="text-sm font-medium text-charcoal">{t("community.available")}</p>

          {/* Merchants */}
          {summary.merchants && (
            <div className="rounded-klein border border-sage/40 bg-sage/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-sage shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-charcoal">
                      {summary.merchants.count} Händler
                    </p>
                    <p className="text-xs text-slate">Stand: {summary.merchants.source_version}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowMerchants((v) => !v)}
                  >
                    {showMerchants ? t("community.hide") : t("community.preview")}
                    {showMerchants ? (
                      <ChevronUp className="ml-1 size-3" />
                    ) : (
                      <ChevronDown className="ml-1 size-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void handleApplyMerchants()}
                    disabled={applying}
                  >
                    {applying ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <Download className="mr-1 size-3" />
                    )}
                    {t("community.applyMerchants")}
                  </Button>
                </div>
              </div>

              {showMerchants && (
                <div className="mt-3 max-h-52 overflow-y-auto rounded-klein border border-border bg-card">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left font-medium text-slate">Händler</th>
                        <th className="px-3 py-2 text-left font-medium text-slate">Kategorie</th>
                        <th className="px-3 py-2 text-left font-medium text-slate">Aliase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.merchants.release.merchants.map((m) => (
                        <tr key={m.canonical_name} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-1.5 font-medium text-charcoal">{m.display_name}</td>
                          <td className="px-3 py-1.5 text-slate">
                            {m.default_category_template_key ?? (
                              <span className="italic">{t("community.noAssignment")}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-slate">
                            {m.aliases.map((a) => a.value).join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Bank Profiles (info only – no auto-apply, user must use Import Wizard) */}
          {summary.bankProfiles && (
            <div className="rounded-klein border border-petrol/30 bg-petrol/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-petrol shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-charcoal">
                      {summary.bankProfiles.count} Bank-Profile
                    </p>
                    <p className="text-xs text-slate">Stand: {summary.bankProfiles.source_version}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={() => setShowBankProfiles((v) => !v)}
                >
                  {showBankProfiles ? t("community.hide") : t("community.preview")}
                  {showBankProfiles ? (
                    <ChevronUp className="ml-1 size-3" />
                  ) : (
                    <ChevronDown className="ml-1 size-3" />
                  )}
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => void handleApplyBankProfiles()}
                  disabled={applying}
                >
                  {applying ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <Download className="mr-1 size-3" />
                  )}
                  Übernehmen
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate">
                {t("community.bankProfilesHint")}
              </p>

              {showBankProfiles && (
                <div className="mt-3 space-y-1">
                  {((summary.bankProfiles.raw as { profiles: { name: string; headers: string[] }[] }).profiles ?? []).map(
                    (p: { name: string; headers: string[] }) => (
                      <div
                        key={p.name}
                        className="flex items-center gap-2 rounded-klein bg-card px-3 py-1.5 text-xs"
                      >
                        <CheckCircle2 className="size-3 text-petrol shrink-0" />
                        <span className="font-medium text-charcoal">{p.name}</span>
                        <span className="text-slate truncate">{p.headers.slice(0, 3).join(", ")}…</span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
