/**
 * QuoteSettings – Opt-in Schalter für Kursdaten-Abrufe.
 * Standardmäßig deaktiviert. Beim ersten Aktivieren erscheint ein
 * expliziter Datenschutzhinweis, den der Nutzer bestätigen muss.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ExternalLink, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  getQuoteSettings,
  saveQuoteSettings,
  PROVIDER_METADATA,
  type PriceProviderId,
} from "@/lib/quotes";

const PROVIDER_IDS: PriceProviderId[] = ["yahoo", "alpaca", "manual"];

export function QuoteSettings() {
  const { t } = useTranslation("profil");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [providerId, setProviderId] = useState<PriceProviderId>("yahoo");
  const [alpacaKey, setAlpacaKey] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState({
    enabled: false,
    providerId: "yahoo" as PriceProviderId,
    alpacaKey: "",
    alpacaSecret: "",
    privacyAccepted: false,
  });

  useEffect(() => {
    void getQuoteSettings().then((s) => {
      setEnabled(s.enabled);
      setProviderId(s.providerId);
      setAlpacaKey(s.alpacaKey);
      setAlpacaSecret(s.alpacaSecret);
      setPrivacyAccepted(s.privacyAccepted);
      setSavedSnapshot(s);
      setLoading(false);
    });
  }, []);

  async function handleToggleEnable(wantsEnabled: boolean) {
    if (wantsEnabled && !privacyAccepted) {
      setShowPrivacyDialog(true);
      return;
    }
    setEnabled(wantsEnabled);
    setSaving(true);
    await saveQuoteSettings(wantsEnabled, providerId, alpacaKey, alpacaSecret, privacyAccepted);
    setSavedSnapshot({ enabled: wantsEnabled, providerId, alpacaKey, alpacaSecret, privacyAccepted });
    setSaving(false);
    toast.success(wantsEnabled ? t("quoteSettings.enabledToast") : t("quoteSettings.disabledToast"));
  }

  async function handleAcceptPrivacy() {
    setPrivacyAccepted(true);
    setEnabled(true);
    setShowPrivacyDialog(false);
    setSaving(true);
    await saveQuoteSettings(true, providerId, alpacaKey, alpacaSecret, true);
    setSavedSnapshot({ enabled: true, providerId, alpacaKey, alpacaSecret, privacyAccepted: true });
    setSaving(false);
    toast.success(t("quoteSettings.enabledToast"));
  }

  async function handleSaveProvider() {
    setSaving(true);
    await saveQuoteSettings(enabled, providerId, alpacaKey, alpacaSecret, privacyAccepted);
    setSavedSnapshot({ enabled, providerId, alpacaKey, alpacaSecret, privacyAccepted });
    setSaving(false);
    toast.success(t("quoteSettings.settingsSavedToast"));
  }

  if (loading) return <p className="text-xs text-slate">{t("quoteSettings.loading")}</p>;

  const meta = PROVIDER_METADATA[providerId];
  const isDirty =
    savedSnapshot.enabled !== enabled ||
    savedSnapshot.providerId !== providerId ||
    savedSnapshot.alpacaKey !== alpacaKey ||
    savedSnapshot.alpacaSecret !== alpacaSecret ||
    savedSnapshot.privacyAccepted !== privacyAccepted;

  return (
    <div className="space-y-4">
      {/* Privacy disclosure dialog */}
      {showPrivacyDialog && (
        <div className="rounded-standard border border-gold/40 bg-gold/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="size-5 text-gold mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-charcoal">{t("quoteSettings.privacyTitle")}</p>
              <p className="mt-1 text-xs text-slate leading-relaxed">
                {PROVIDER_METADATA[providerId].privacyNote}
              </p>
              <p className="mt-2 text-xs text-slate leading-relaxed">{t("quoteSettings.privacyNote")}</p>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => void handleAcceptPrivacy()}>
              {t("quoteSettings.acceptAndEnable")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPrivacyDialog(false)}>
              {t("quoteSettings.cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-charcoal">{t("quoteSettings.title")}</p>
          <p className="text-xs text-slate">
            {enabled ? (
              <span className="flex items-center gap-1 text-sage">
                <ShieldCheck className="size-3" /> {t("quoteSettings.activeStatus", { provider: meta.label })}
              </span>
            ) : (
              t("quoteSettings.disabledStatus")
            )}
          </p>
        </div>
        <Button
          variant={enabled ? "destructive" : "default"}
          size="sm"
          onClick={() => void handleToggleEnable(!enabled)}
          disabled={saving}
        >
          {saving && <Loader2 className="mr-1.5 size-3 animate-spin" />}
          {enabled ? t("quoteSettings.disable") : t("quoteSettings.enable")}
        </Button>
      </div>

      {/* Provider selection (only visible when enabled) */}
      {enabled && (
        <div className="space-y-3 rounded-standard border border-border bg-paper p-4">
          <div className="space-y-1.5">
            <Label htmlFor="quote-provider">{t("quoteSettings.providerLabel")}</Label>
            <Select
              value={providerId}
              onValueChange={(v) => setProviderId(v as PriceProviderId)}
            >
              <SelectTrigger id="quote-provider" className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {PROVIDER_METADATA[id].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate">{meta.description}</p>
            {meta.requiresApiKey && (
              <a
                href="https://app.alpaca.markets/signup"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-petrol underline"
              >
                {t("quoteSettings.alpacaSignup")}
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>

          {/* Alpaca API key inputs */}
          {providerId === "alpaca" && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="alpaca-key" className="text-xs">{t("quoteSettings.apiKeyLabel")}</Label>
                <Input
                  id="alpaca-key"
                  placeholder="PKXXXXXXXXXXXXXXXXXXXXXXXX"
                  value={alpacaKey}
                  onChange={(e) => setAlpacaKey(e.target.value)}
                  className="max-w-sm font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="alpaca-secret" className="text-xs">{t("quoteSettings.apiSecretLabel")}</Label>
                <Input
                  id="alpaca-secret"
                  type="password"
                  placeholder="••••••••••••••••••••••••••••••••••••••••"
                  value={alpacaSecret}
                  onChange={(e) => setAlpacaSecret(e.target.value)}
                  className="max-w-sm font-mono text-xs"
                />
              </div>
              <p className="text-xs text-slate">{t("quoteSettings.apiKeyStorageNote")}</p>
            </div>
          )}

          {/* Privacy reminder */}
          <div className="flex items-start gap-2 rounded-klein bg-petrol/5 px-3 py-2">
            <ShieldCheck className="size-3.5 text-petrol mt-0.5 shrink-0" />
            <p className="text-xs text-slate">{meta.privacyNote}</p>
          </div>

          {isDirty && (
            <Button size="sm" onClick={() => void handleSaveProvider()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-3 animate-spin" />}
              {t("quoteSettings.saveSettings")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
