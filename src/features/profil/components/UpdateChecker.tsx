import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, Loader2 } from "lucide-react";
import { getSetting, setSetting } from "@/db/repositories/settings";
import { checkForUpdate, downloadAndInstallUpdate } from "@/lib/updater";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

/**
 * Update-Prüfung (prompt-auto-update.md): manueller Button + optionaler Auto-Check beim Start
 * (Default aus). Ein Fehler (kein Internet, GitHub nicht erreichbar) wird bewusst nicht wie ein
 * App-Fehler dargestellt – die Update-Prüfung ist ein optionaler Zusatzdienst.
 */
export function UpdateChecker() {
  const { t } = useTranslation("profil");
  const [autoCheck, setAutoCheck] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);

  useEffect(() => {
    void getSetting("check_updates_on_startup").then((v) => setAutoCheck(v === "1"));
  }, []);

  async function handleToggle(checked: boolean) {
    setAutoCheck(checked);
    await setSetting("check_updates_on_startup", checked ? "1" : "0");
  }

  async function handleCheck() {
    setChecking(true);
    setAvailableVersion(null);
    try {
      const result = await checkForUpdate();
      if (result.errorMessage) {
        toast.info(t("updateChecker.checkUnavailable"));
        return;
      }
      if (result.available) {
        setAvailableVersion(result.version ?? null);
      } else {
        toast.success(t("updateChecker.upToDate"));
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleInstall() {
    setInstalling(true);
    try {
      await downloadAndInstallUpdate();
    } catch (e) {
      showErrorToast(t("updateChecker.updateFailed", { error: String(e) }));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="auto-update-check" className="cursor-pointer text-sm font-medium text-charcoal">
            {t("updateChecker.autoCheckLabel")}
          </Label>
          <p className="text-xs text-slate">{t("updateChecker.autoCheckHint")}</p>
        </div>
        <Switch id="auto-update-check" checked={autoCheck} onCheckedChange={(c) => void handleToggle(c)} />
      </div>

      <Button variant="outline" onClick={() => void handleCheck()} disabled={checking}>
        {checking ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <RefreshCw className="mr-1.5 size-4" />}
        {t("updateChecker.checkButton")}
      </Button>

      {availableVersion && (
        <div className="rounded-klein border border-sage bg-sage/10 p-3 text-sm">
          <p className="text-charcoal">{t("updateChecker.versionAvailable", { version: availableVersion })}</p>
          <Button size="sm" className="mt-2" onClick={() => void handleInstall()} disabled={installing}>
            {installing ? t("updateChecker.installing") : t("updateChecker.downloadAndInstall")}
          </Button>
        </div>
      )}
    </div>
  );
}
