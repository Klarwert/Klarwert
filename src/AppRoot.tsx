import { useEffect, useState } from "react";
import { runMigrations, repairDatabase, resetDatabase } from "@/db/migrate";
import { ensureBuiltinBankProfiles } from "@/lib/import/bankProfiles";
import { useSettingsStore } from "@/stores/settingsStore";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/**
 * DB-Migrationen (Abschnitt 2), Settings/Onboarding-Gate (Abschnitt 3) und
 * Kern-Layout (Abschnitt 4) laufen hier zusammen.
 */
export function AppRoot() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const load = useSettingsStore((s) => s.load);
  const loaded = useSettingsStore((s) => s.loaded);
  const onboardingDone = useSettingsStore((s) => s.onboardingDone);
  const currency = useSettingsStore((s) => s.currency);

  const initApp = async () => {
    try {
      setError(null);
      await runMigrations();
      await Promise.all([load(), ensureBuiltinBankProfiles()]);
      setReady(true);
      void checkForUpdateOnStartupIfEnabled();
    } catch (e) {
      setError(String(e));
    }
  };

  /**
   * Optionaler Auto-Check (Default aus, siehe Profil-Seite): bewusst fire-and-forget, jeder Fehler
   * bleibt lokal und wird nie als App-Fehler angezeigt – Update-Prüfung ist kein Kernfeature.
   */
  const checkForUpdateOnStartupIfEnabled = async () => {
    try {
      const { getSetting } = await import("@/db/repositories/settings");
      if ((await getSetting("check_updates_on_startup")) !== "1") return;
      const { checkForUpdate } = await import("@/lib/updater");
      const result = await checkForUpdate();
      if (result.available) {
        const { toast } = await import("sonner");
        toast.info(`Version ${result.version} ist verfügbar – siehe Profil & Einstellungen.`);
      }
    } catch {
      // Update-Prüfung ist optional; ein Fehler hier darf die App nie beeinträchtigen.
    }
  };

  useEffect(() => {
    void initApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const handleRepair = async () => {
    setIsProcessing(true);
    try {
      setError(null);
      await repairDatabase();
      await Promise.all([load(), ensureBuiltinBankProfiles()]);
      setReady(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = async () => {
    setIsProcessing(true);
    try {
      setError(null);
      await resetDatabase();
      await Promise.all([load(), ensureBuiltinBankProfiles()]);
      setReady(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 p-6 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
        <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-xl dark:border-red-900/40 dark:bg-slate-800">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
            <svg
              className="h-6 w-6 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="text-lg font-semibold">Datenbank-Fehler beim App-Start</h2>
          </div>

          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Die lokale SQLite-Datenbank konnte nicht geladen werden. Du kannst versuchen, die Datenbank automatisch zu reparieren, oder sie auf den Werkszustand zurückzusetzen, um neu zu starten.
          </p>

          <div className="mt-4 max-h-36 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-red-700 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400">
            {error}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={isProcessing}
              onClick={() => void handleRepair()}
            >
              {isProcessing ? "Repariere…" : "Erneut versuchen & Reparieren"}
            </Button>

            <Button
              variant="destructive"
              disabled={isProcessing}
              onClick={() => setShowResetConfirm(true)}
            >
              Datenbank zurücksetzen
            </Button>
          </div>
        </div>

        <ConfirmDialog
          open={showResetConfirm}
          onOpenChange={setShowResetConfirm}
          title="Datenbank zurücksetzen?"
          description="Alle lokalen Kontodaten, Transaktionen und Regeln werden gelöscht. Danach wirst du zum Onboarding weitergeleitet und kannst deine Bankdaten neu importieren."
          confirmLabel="Ja, alle Daten löschen"
          cancelLabel="Abbrechen"
          variant="destructive"
          onConfirm={() => void handleReset()}
        />
      </div>
    );
  }

  if (!ready || !loaded) {
    return (
      <div className="flex h-screen items-center justify-center text-slate">
        Lädt…
      </div>
    );
  }

  if (!onboardingDone) {
    return <Onboarding />;
  }

  // key=currency: formatEur/formatAmount (money.ts) read the currency setting via a non-reactive
  // store snapshot, so most components displaying a monetary value never re-render on their own
  // when it changes. Remounting the whole shell on a currency change is the simplest fix that
  // doesn't require threading a currency subscription through every component that shows an amount.
  return <AppShell key={currency} />;
}

