/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Flame, Save, Trash2, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEffectiveCapitalTaxRate } from "@/lib/rechner/tax";
import { useSettingsStore } from "@/stores/settingsStore";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/dates";
import { usePersons } from "@/hooks/usePersons";
import {
  deleteScenario,
  listSavedScenarios,
  saveScenario,
  type SavedScenario,
} from "@/db/repositories/rechner";
import { useElementWidth } from "@/hooks/useElementWidth";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

import { FireTab } from "./components/FireTab";
import { ZinseszinsTab } from "./components/ZinseszinsTab";
import { EntnahmeTab } from "./components/EntnahmeTab";

import { useFireRechner } from "./hooks/useFireRechner";
import { useZinseszinsRechner } from "./hooks/useZinseszinsRechner";
import { useEntnahmeRechner } from "./hooks/useEntnahmeRechner";

const RECHNER_STATE_KEY = "klarwert_rechner_persistent_inputs";

function getStoredState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(RECHNER_STATE_KEY);
    if (!raw) return fallback;
    const json = JSON.parse(raw);
    return json[key] !== undefined ? json[key] : fallback;
  } catch {
    return fallback;
  }
}

export function RechnerPage() {
  const { t } = useTranslation("rechner");
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const { data: persons } = usePersons();
  const [activeTab, setActiveTab] = useState<"fire" | "zinseszins" | "entnahme">(() =>
    getStoredState("activeTab", "fire"),
  );
  const [scenarioName, setScenarioName] = useState("");
  const [savedList, setSavedList] = useState(() => listSavedScenarios());

  const fireChartContainer = useElementWidth<HTMLDivElement>();
  const zinChartContainer = useElementWidth<HTMLDivElement>();
  const entChartContainer = useElementWidth<HTMLDivElement>();

  const { kirchensteuerAktiv, kirchensteuerSatz } = useSettingsStore();
  const defaultTaxRate = getEffectiveCapitalTaxRate(kirchensteuerAktiv, kirchensteuerSatz).toString();

  const fireRechner = useFireRechner(getStoredState, defaultTaxRate, persons, fireChartContainer.width);
  const zinRechner = useZinseszinsRechner(getStoredState, defaultTaxRate, zinChartContainer.width);
  const entRechner = useEntnahmeRechner(getStoredState, defaultTaxRate, entChartContainer.width, fireRechner.computed.fireCurrentAge);

  // Store persistent state on every change
  useEffect(() => {
    const currentState = {
      activeTab,
      ...fireRechner.state,
      ...zinRechner.state,
      ...entRechner.state,
    };
    try {
      localStorage.setItem(RECHNER_STATE_KEY, JSON.stringify(currentState));
    } catch {
      // z. B. Speicher voll oder localStorage deaktiviert - Persistenz ist rein komfortabel
    }
  }, [
    activeTab,
    fireRechner.state,
    zinRechner.state,
    entRechner.state,
  ]);

  function handleSaveScenario() {
    if (!scenarioName.trim()) return;
    let payload: unknown;
    if (activeTab === "fire") {
      payload = { ...fireRechner.state };
    } else if (activeTab === "zinseszins") {
      payload = { ...zinRechner.state };
    } else {
      payload = { ...entRechner.state };
    }

    saveScenario(activeTab, scenarioName.trim(), payload);
    setScenarioName("");
    setSavedList(listSavedScenarios());
    toast.success(t("common.saveScenario"));
  }

  function handleLoadScenario(scen: SavedScenario) {
    try {
      const inputs = JSON.parse(scen.inputsJson) as Record<string, any>;
      if (scen.type === "fire") {
        if (inputs.fireMode !== undefined) fireRechner.actions.setFireMode(inputs.fireMode);
        if (inputs.fireMonthlyNet !== undefined) fireRechner.actions.setFireMonthlyNet(String(inputs.fireMonthlyNet));
        if (inputs.fireReturn !== undefined) fireRechner.actions.setFireReturn(String(inputs.fireReturn));
        if (inputs.fireInflation !== undefined) fireRechner.actions.setFireInflation(String(inputs.fireInflation));
        if (inputs.fireSwr !== undefined) fireRechner.actions.setFireSwr(String(inputs.fireSwr));
        if (inputs.fireTax !== undefined) fireRechner.actions.setFireTax(String(inputs.fireTax));
        if (inputs.fireTeilfreistellung !== undefined)
          fireRechner.actions.setFireTeilfreistellung(Boolean(inputs.fireTeilfreistellung));
        if (inputs.fireCapital !== undefined) fireRechner.actions.setFireCapital(String(inputs.fireCapital));
        if (inputs.fireSavingsRate !== undefined)
          fireRechner.actions.setFireSavingsRate(String(inputs.fireSavingsRate));
        if (inputs.fireTargetAge !== undefined) fireRechner.actions.setFireTargetAge(String(inputs.fireTargetAge));
        if (inputs.fireCapitalDepletion !== undefined)
          fireRechner.actions.setFireCapitalDepletion(Boolean(inputs.fireCapitalDepletion));
        if (inputs.firePersonId !== undefined) fireRechner.actions.setFirePersonId(String(inputs.firePersonId));
      } else if (scen.type === "zinseszins") {
        if (inputs.zinInitial !== undefined) zinRechner.actions.setZinInitial(String(inputs.zinInitial));
        if (inputs.zinSavings !== undefined) zinRechner.actions.setZinSavings(String(inputs.zinSavings));
        if (inputs.zinStepUp !== undefined) zinRechner.actions.setZinStepUp(String(inputs.zinStepUp));
        if (inputs.zinReturn !== undefined) zinRechner.actions.setZinReturn(String(inputs.zinReturn));
        if (inputs.zinYears !== undefined) zinRechner.actions.setZinYears(String(inputs.zinYears));
        if (inputs.zinInflation !== undefined) zinRechner.actions.setZinInflation(String(inputs.zinInflation));
        if (inputs.zinTer !== undefined) zinRechner.actions.setZinTer(String(inputs.zinTer));
        if (inputs.zinTaxActive !== undefined) zinRechner.actions.setZinTaxActive(Boolean(inputs.zinTaxActive));
        if (inputs.zinTaxRate !== undefined) zinRechner.actions.setZinTaxRate(String(inputs.zinTaxRate));
        if (inputs.zinPayout !== undefined) zinRechner.actions.setZinPayout(inputs.zinPayout);
      } else if (scen.type === "entnahme") {
        if (inputs.entInitial !== undefined) entRechner.actions.setEntInitial(String(inputs.entInitial));
        if (inputs.entMonthly !== undefined) entRechner.actions.setEntMonthly(String(inputs.entMonthly));
        if (inputs.entAdjustInf !== undefined) entRechner.actions.setEntAdjustInf(Boolean(inputs.entAdjustInf));
        if (inputs.entHorizon !== undefined) entRechner.actions.setEntHorizon(String(inputs.entHorizon));
        if (inputs.entReturn !== undefined) entRechner.actions.setEntReturn(String(inputs.entReturn));
        if (inputs.entInflation !== undefined) entRechner.actions.setEntInflation(String(inputs.entInflation));
        if (inputs.entTer !== undefined) entRechner.actions.setEntTer(String(inputs.entTer));
        if (inputs.entTaxActive !== undefined) entRechner.actions.setEntTaxActive(Boolean(inputs.entTaxActive));
        if (inputs.entTaxRate !== undefined) entRechner.actions.setEntTaxRate(String(inputs.entTaxRate));
      }
      toast.success(t("common.loadScenario", { name: scen.name }));
    } catch {
      showErrorToast(t("common.errorLoadScenario"));
    }
  }

  function handleDeleteScenario(id: string) {
    deleteScenario(id);
    setSavedList(listSavedScenarios());
    toast.success(t("common.deleteScenario"));
  }

  const tabSavedScenarios = useMemo(
    () => savedList.filter((s) => s.type === activeTab),
    [savedList, activeTab],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl text-charcoal">{t("title")}</h1>
          <p className="text-sm text-slate">
            {t("description")}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="fire" className="gap-2">
            <Flame className="size-4" /> {t("tabs.fire")}
          </TabsTrigger>
          <TabsTrigger value="zinseszins" className="gap-2">
            <TrendingUp className="size-4" /> {t("tabs.zinseszins")}
          </TabsTrigger>
          <TabsTrigger value="entnahme" className="gap-2">
            <Wallet className="size-4" /> {t("tabs.entnahme")}
          </TabsTrigger>
        </TabsList>

        {/* --- FIRE TAB --- */}
        <TabsContent value="fire" className="mt-6 space-y-6">
          <FireTab
            t={t}
            persons={persons}

            fireMode={fireRechner.state.fireMode}
            setFireMode={fireRechner.actions.setFireMode}
            fireMonthlyNet={fireRechner.state.fireMonthlyNet}
            setFireMonthlyNet={fireRechner.actions.setFireMonthlyNet}
            fireSavingsRate={fireRechner.state.fireSavingsRate}
            setFireSavingsRate={fireRechner.actions.setFireSavingsRate}
            fireTargetAge={fireRechner.state.fireTargetAge}
            setFireTargetAge={fireRechner.actions.setFireTargetAge}
            fireCapital={fireRechner.state.fireCapital}
            setFireCapital={fireRechner.actions.setFireCapital}
            fireReturn={fireRechner.state.fireReturn}
            setFireReturn={fireRechner.actions.setFireReturn}
            fireInflation={fireRechner.state.fireInflation}
            setFireInflation={fireRechner.actions.setFireInflation}
            fireSwr={fireRechner.state.fireSwr}
            setFireSwr={fireRechner.actions.setFireSwr}
            fireTax={fireRechner.state.fireTax}
            setFireTax={fireRechner.actions.setFireTax}
            fireTeilfreistellung={fireRechner.state.fireTeilfreistellung}
            setFireTeilfreistellung={fireRechner.actions.setFireTeilfreistellung}
            fireCapitalDepletion={fireRechner.state.fireCapitalDepletion}
            setFireCapitalDepletion={fireRechner.actions.setFireCapitalDepletion}
            firePersonId={fireRechner.state.firePersonId}
            setFirePersonId={fireRechner.actions.setFirePersonId}
            fireResult={fireRechner.computed.result}
            fireChartOption={fireRechner.computed.chartOption}
          />
        </TabsContent>

        {/* --- ZINSESZINS TAB --- */}
        <TabsContent value="zinseszins" className="mt-6 space-y-6">
          <ZinseszinsTab
            t={t}
            zinInitial={zinRechner.state.zinInitial}
            setZinInitial={zinRechner.actions.setZinInitial}
            zinSavings={zinRechner.state.zinSavings}
            setZinSavings={zinRechner.actions.setZinSavings}
            zinStepUp={zinRechner.state.zinStepUp}
            setZinStepUp={zinRechner.actions.setZinStepUp}
            zinReturn={zinRechner.state.zinReturn}
            setZinReturn={zinRechner.actions.setZinReturn}
            zinYears={zinRechner.state.zinYears}
            setZinYears={zinRechner.actions.setZinYears}
            zinInflation={zinRechner.state.zinInflation}
            setZinInflation={zinRechner.actions.setZinInflation}
            zinTer={zinRechner.state.zinTer}
            setZinTer={zinRechner.actions.setZinTer}
            zinTaxActive={zinRechner.state.zinTaxActive}
            setZinTaxActive={zinRechner.actions.setZinTaxActive}
            zinTaxRate={zinRechner.state.zinTaxRate}
            setZinTaxRate={zinRechner.actions.setZinTaxRate}
            zinPayout={zinRechner.state.zinPayout}
            setZinPayout={zinRechner.actions.setZinPayout}
            zinResult={zinRechner.computed.result}
            zinChartOption={zinRechner.computed.chartOption}
            zinChartContainerRef={zinChartContainer.ref}
          />
        </TabsContent>

        {/* --- ENTNAHME TAB --- */}
        <TabsContent value="entnahme" className="mt-6 space-y-6">
          <EntnahmeTab
            t={t}
            entInitial={entRechner.state.entInitial}
            setEntInitial={entRechner.actions.setEntInitial}
            entMonthly={entRechner.state.entMonthly}
            setEntMonthly={entRechner.actions.setEntMonthly}
            entAdjustInf={entRechner.state.entAdjustInf}
            setEntAdjustInf={entRechner.actions.setEntAdjustInf}
            entHorizon={entRechner.state.entHorizon}
            setEntHorizon={entRechner.actions.setEntHorizon}
            entReturn={entRechner.state.entReturn}
            setEntReturn={entRechner.actions.setEntReturn}
            entInflation={entRechner.state.entInflation}
            setEntInflation={entRechner.actions.setEntInflation}
            entTer={entRechner.state.entTer}
            setEntTer={entRechner.actions.setEntTer}
            entTaxActive={entRechner.state.entTaxActive}
            setEntTaxActive={entRechner.actions.setEntTaxActive}
            entTaxRate={entRechner.state.entTaxRate}
            setEntTaxRate={entRechner.actions.setEntTaxRate}
            entResult={entRechner.computed.result}
            entChartOption={entRechner.computed.chartOption}
            entChartContainerRef={entChartContainer.ref}
          />
        </TabsContent>
      </Tabs>

      {/* --- SCENARIO SAVE & LIST PER TAB --- */}
      <section className="rounded-standard border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <Save className="size-4 text-petrol" /> {t("scenarios.savedTitle")} (
          {t(`tabs.${activeTab}`)})
        </h2>
        <div className="flex gap-2 max-w-md">
          <Input
            placeholder={t("scenarios.placeholder")}
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
          />
          <Button onClick={handleSaveScenario} disabled={!scenarioName.trim()}>
            {t("scenarios.saveButton")}
          </Button>
        </div>

        <div className="space-y-2 pt-2">
          {tabSavedScenarios.map((scen) => (
            <div
              key={scen.id}
              className="flex items-center justify-between gap-3 rounded-klein bg-paper p-3 text-xs"
            >
              <div>
                <span className="font-semibold text-charcoal">{scen.name}</span>
                <span className="ml-2 text-slate">
                  ({t(`tabs.${scen.type}`)}) ·{" "}
                  {formatDate(scen.createdAt.slice(0, 10), dateDisplayFormat)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleLoadScenario(scen)}
                >
                  <Download className="size-3" /> {t("scenarios.loadAction")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDeleteScenario(scen.id)}
                >
                  <Trash2 className="size-3 text-brick" />
                </Button>
              </div>
            </div>
          ))}
          {tabSavedScenarios.length === 0 && (
            <p className="text-xs text-slate">{t("scenarios.noneSaved")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
