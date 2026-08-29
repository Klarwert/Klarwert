/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Flame, Save, Trash2, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/dates";
import { parseAmountToCentsOrZero } from "@/lib/money";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePersons } from "@/hooks/usePersons";
import { calculateFire } from "@/lib/rechner/fire";
import { calculateZinseszins } from "@/lib/rechner/zinseszins";
import { calculateEntnahme } from "@/lib/rechner/entnahme";
import {
  deleteScenario,
  listSavedScenarios,
  saveScenario,
  type SavedScenario,
} from "@/db/repositories/rechner";
import { amountAxisLabel } from "@/lib/charts/theme";
import { useElementWidth } from "@/hooks/useElementWidth";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

const NARROW_CHART_BREAKPOINT = 500;

const RECHNER_STATE_KEY = "klarwert_rechner_persistent_inputs";
import { FireTab } from "./components/FireTab";
import { ZinseszinsTab } from "./components/ZinseszinsTab";
import { EntnahmeTab } from "./components/EntnahmeTab";

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

  // --- FIRE State ---
  const [fireMode, setFireMode] = useState<"when_free" | "how_much">(() =>
    getStoredState("fireMode", "when_free"),
  );
  const [fireMonthlyNet, setFireMonthlyNet] = useState(() =>
    getStoredState("fireMonthlyNet", "2500"),
  );
  const [fireReturn, setFireReturn] = useState(() => getStoredState("fireReturn", "6.0"));
  const [fireInflation, setFireInflation] = useState(() => getStoredState("fireInflation", "2.0"));
  const [fireSwr, setFireSwr] = useState(() => getStoredState("fireSwr", "3.5"));
  const [fireTax, setFireTax] = useState(() => getStoredState("fireTax", "26.375"));
  const [fireTeilfreistellung, setFireTeilfreistellung] = useState(() =>
    getStoredState("fireTeilfreistellung", true),
  );
  const [fireCapital, setFireCapital] = useState(() => getStoredState("fireCapital", "50000"));
  const [fireSavingsRate, setFireSavingsRate] = useState(() =>
    getStoredState("fireSavingsRate", "800"),
  );
  const [fireTargetAge, setFireTargetAge] = useState(() => getStoredState("fireTargetAge", "60"));
  const [fireCapitalDepletion, setFireCapitalDepletion] = useState(() =>
    getStoredState("fireCapitalDepletion", false),
  );
  const [firePersonId, setFirePersonId] = useState<string>(() =>
    getStoredState("firePersonId", "all"),
  );

  // --- Zinseszins State ---
  const [zinInitial, setZinInitial] = useState(() => getStoredState("zinInitial", "10000"));
  const [zinSavings, setZinSavings] = useState(() => getStoredState("zinSavings", "300"));
  const [zinStepUp, setZinStepUp] = useState(() => getStoredState("zinStepUp", "2.0"));
  const [zinReturn, setZinReturn] = useState(() => getStoredState("zinReturn", "6.0"));
  const [zinYears, setZinYears] = useState(() => getStoredState("zinYears", "20"));
  const [zinInflation, setZinInflation] = useState(() => getStoredState("zinInflation", "2.0"));
  const [zinTer, setZinTer] = useState(() => getStoredState("zinTer", "0.2"));
  const [zinTaxActive, setZinTaxActive] = useState(() => getStoredState("zinTaxActive", true));
  const [zinTaxRate, setZinTaxRate] = useState(() => getStoredState("zinTaxRate", "26.375"));
  const [zinPayout, setZinPayout] = useState<"ausschüttend" | "thesaurierend">(() =>
    getStoredState("zinPayout", "thesaurierend"),
  );

  // --- Entnahme State ---
  const [entInitial, setEntInitial] = useState(() => getStoredState("entInitial", "300000"));
  const [entMonthly, setEntMonthly] = useState(() => getStoredState("entMonthly", "1200"));
  const [entAdjustInf, setEntAdjustInf] = useState(() => getStoredState("entAdjustInf", true));
  const [entHorizon, setEntHorizon] = useState(() => getStoredState("entHorizon", "30"));
  const [entReturn, setEntReturn] = useState(() => getStoredState("entReturn", "5.0"));
  const [entInflation, setEntInflation] = useState(() => getStoredState("entInflation", "2.0"));
  const [entTer, setEntTer] = useState(() => getStoredState("entTer", "0.2"));
  const [entTaxActive, setEntTaxActive] = useState(() => getStoredState("entTaxActive", true));
  const [entTaxRate, setEntTaxRate] = useState(() => getStoredState("entTaxRate", "26.375"));

  // Store persistent state on every change
  useEffect(() => {
    const currentState = {
      activeTab,
      fireMode,
      fireMonthlyNet,
      fireReturn,
      fireInflation,
      fireSwr,
      fireTax,
      fireTeilfreistellung,
      fireCapital,
      fireSavingsRate,
      fireTargetAge,
      fireCapitalDepletion,
      firePersonId,
      zinInitial,
      zinSavings,
      zinStepUp,
      zinReturn,
      zinYears,
      zinInflation,
      zinTer,
      zinTaxActive,
      zinTaxRate,
      zinPayout,
      entInitial,
      entMonthly,
      entAdjustInf,
      entHorizon,
      entReturn,
      entInflation,
      entTer,
      entTaxActive,
      entTaxRate,
    };
    try {
      localStorage.setItem(RECHNER_STATE_KEY, JSON.stringify(currentState));
    } catch {
      // z. B. Speicher voll oder localStorage deaktiviert - Persistenz ist rein komfortabel
    }
  }, [
    activeTab,
    fireMode,
    fireMonthlyNet,
    fireReturn,
    fireInflation,
    fireSwr,
    fireTax,
    fireTeilfreistellung,
    fireCapital,
    fireSavingsRate,
    fireTargetAge,
    fireCapitalDepletion,
    firePersonId,
    zinInitial,
    zinSavings,
    zinStepUp,
    zinReturn,
    zinYears,
    zinInflation,
    zinTer,
    zinTaxActive,
    zinTaxRate,
    zinPayout,
    entInitial,
    entMonthly,
    entAdjustInf,
    entHorizon,
    entReturn,
    entInflation,
    entTer,
    entTaxActive,
    entTaxRate,
  ]);

  const selectedPerson = persons?.find((p) => String(p.id) === firePersonId);
  const fireCurrentAge = selectedPerson?.birth_year
    ? new Date().getFullYear() - selectedPerson.birth_year
    : 35;

  const fireResult = useMemo(() => {
    return calculateFire({
      mode: fireMode,
      monthlyNetIncomeCents: parseAmountToCentsOrZero(fireMonthlyNet),
      expectedReturnPercent: parseFloat(fireReturn) || 0,
      inflationPercent: parseFloat(fireInflation) || 0,
      swrPercent: parseFloat(fireSwr) || 0,
      taxRatePercent: parseFloat(fireTax) || 0,
      teilfreistellung: fireTeilfreistellung,
      currentCapitalCents: parseAmountToCentsOrZero(fireCapital),
      monthlySavingsRateCents: parseAmountToCentsOrZero(fireSavingsRate),
      targetAge: parseInt(fireTargetAge, 10) || 60,
      capitalDepletion: fireCapitalDepletion,
      currentAge: fireCurrentAge,
    });
  }, [
    fireMode,
    fireMonthlyNet,
    fireReturn,
    fireInflation,
    fireSwr,
    fireTax,
    fireTeilfreistellung,
    fireCapital,
    fireSavingsRate,
    fireTargetAge,
    fireCapitalDepletion,
    fireCurrentAge,
  ]);

  const fireChartOption = useMemo(() => {
    const years = fireResult.yearlyPoints.map((p) => p.year);
    const contrib = fireResult.yearlyPoints.map((p) => Math.round(p.contributionsCents / 100));
    const growth = fireResult.yearlyPoints.map((p) => Math.round(p.growthCents / 100));

    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Einzahlungen", "Wertzuwachs"], bottom: 0 },
      xAxis: { type: "category", data: years },
      yAxis: {
        type: "value",
        axisLabel: amountAxisLabel(
          fireChartContainer.width > 0 && fireChartContainer.width < NARROW_CHART_BREAKPOINT,
        ),
      },
      series: [
        {
          name: "Einzahlungen",
          type: "bar",
          stack: "total",
          data: contrib,
          itemStyle: { color: "#4a6fa5" },
        },
        {
          name: "Wertzuwachs",
          type: "bar",
          stack: "total",
          data: growth,
          itemStyle: { color: "#6f9a6d" },
        },
      ],
    };
  }, [fireResult, fireChartContainer.width]);

  const zinResult = useMemo(() => {
    return calculateZinseszins({
      initialCapitalCents: parseAmountToCentsOrZero(zinInitial),
      monthlySavingsRateCents: parseAmountToCentsOrZero(zinSavings),
      annualSavingsIncreasePercent: parseFloat(zinStepUp) || 0,
      interestRatePercent: parseFloat(zinReturn) || 0,
      years: parseInt(zinYears, 10) || 10,
      inflationPercent: parseFloat(zinInflation) || 0,
      terPercent: parseFloat(zinTer) || 0,
      taxActive: zinTaxActive,
      taxRatePercent: parseFloat(zinTaxRate) || 0,
      payoutType: zinPayout,
    });
  }, [
    zinInitial,
    zinSavings,
    zinStepUp,
    zinReturn,
    zinYears,
    zinInflation,
    zinTer,
    zinTaxActive,
    zinTaxRate,
    zinPayout,
  ]);

  const zinChartOption = useMemo(() => {
    const years = zinResult.yearlyPoints.map((p) => p.year);
    const contrib = zinResult.yearlyPoints.map((p) => Math.round(p.contributionsCents / 100));
    const earnings = zinResult.yearlyPoints.map((p) => Math.round(p.earningsCents / 100));

    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Einzahlungen", "Erträge"], bottom: 0 },
      xAxis: { type: "category", data: years },
      yAxis: {
        type: "value",
        axisLabel: amountAxisLabel(
          zinChartContainer.width > 0 && zinChartContainer.width < NARROW_CHART_BREAKPOINT,
        ),
      },
      series: [
        {
          name: "Einzahlungen",
          type: "bar",
          stack: "total",
          data: contrib,
          itemStyle: { color: "#4a6fa5" },
        },
        {
          name: "Erträge",
          type: "bar",
          stack: "total",
          data: earnings,
          itemStyle: { color: "#b79a5b" },
        },
      ],
    };
  }, [zinResult, zinChartContainer.width]);

  const entResult = useMemo(() => {
    return calculateEntnahme({
      initialCapitalCents: parseAmountToCentsOrZero(entInitial),
      monthlyWithdrawalCents: parseAmountToCentsOrZero(entMonthly),
      adjustForInflation: entAdjustInf,
      horizonYears: parseInt(entHorizon, 10) || 30,
      interestRatePercent: parseFloat(entReturn) || 0,
      inflationPercent: parseFloat(entInflation) || 0,
      terPercent: parseFloat(entTer) || 0,
      taxActive: entTaxActive,
      taxRatePercent: parseFloat(entTaxRate) || 0,
      userAge: fireCurrentAge,
    });
  }, [
    entInitial,
    entMonthly,
    entAdjustInf,
    entHorizon,
    entReturn,
    entInflation,
    entTer,
    entTaxActive,
    entTaxRate,
    fireCurrentAge,
  ]);

  const entChartOption = useMemo(() => {
    const years = entResult.yearlyPoints.map((p) => p.year);
    const cap = entResult.yearlyPoints.map((p) => Math.round(p.capitalRemainingCents / 100));

    return {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: years },
      yAxis: {
        type: "value",
        axisLabel: amountAxisLabel(
          entChartContainer.width > 0 && entChartContainer.width < NARROW_CHART_BREAKPOINT,
        ),
      },
      series: [
        {
          name: "Kapitalverlauf",
          type: "line",
          areaStyle: { color: "rgba(74, 111, 165, 0.2)" },
          data: cap,
          itemStyle: { color: "#4a6fa5" },
        },
      ],
    };
  }, [entResult, entChartContainer.width]);

  function handleSaveScenario() {
    if (!scenarioName.trim()) return;
    let payload: unknown;
    if (activeTab === "fire") {
      payload = {
        fireMode,
        fireMonthlyNet,
        fireReturn,
        fireInflation,
        fireSwr,
        fireTax,
        fireTeilfreistellung,
        fireCapital,
        fireSavingsRate,
        fireTargetAge,
        fireCapitalDepletion,
        firePersonId,
      };
    } else if (activeTab === "zinseszins") {
      payload = {
        zinInitial,
        zinSavings,
        zinStepUp,
        zinReturn,
        zinYears,
        zinInflation,
        zinTer,
        zinTaxActive,
        zinTaxRate,
        zinPayout,
      };
    } else {
      payload = {
        entInitial,
        entMonthly,
        entAdjustInf,
        entHorizon,
        entReturn,
        entInflation,
        entTer,
        entTaxActive,
        entTaxRate,
      };
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
        if (inputs.fireMode !== undefined) setFireMode(inputs.fireMode);
        if (inputs.fireMonthlyNet !== undefined) setFireMonthlyNet(String(inputs.fireMonthlyNet));
        if (inputs.fireReturn !== undefined) setFireReturn(String(inputs.fireReturn));
        if (inputs.fireInflation !== undefined) setFireInflation(String(inputs.fireInflation));
        if (inputs.fireSwr !== undefined) setFireSwr(String(inputs.fireSwr));
        if (inputs.fireTax !== undefined) setFireTax(String(inputs.fireTax));
        if (inputs.fireTeilfreistellung !== undefined)
          setFireTeilfreistellung(Boolean(inputs.fireTeilfreistellung));
        if (inputs.fireCapital !== undefined) setFireCapital(String(inputs.fireCapital));
        if (inputs.fireSavingsRate !== undefined)
          setFireSavingsRate(String(inputs.fireSavingsRate));
        if (inputs.fireTargetAge !== undefined) setFireTargetAge(String(inputs.fireTargetAge));
        if (inputs.fireCapitalDepletion !== undefined)
          setFireCapitalDepletion(Boolean(inputs.fireCapitalDepletion));
        if (inputs.firePersonId !== undefined) setFirePersonId(String(inputs.firePersonId));
      } else if (scen.type === "zinseszins") {
        if (inputs.zinInitial !== undefined) setZinInitial(String(inputs.zinInitial));
        if (inputs.zinSavings !== undefined) setZinSavings(String(inputs.zinSavings));
        if (inputs.zinStepUp !== undefined) setZinStepUp(String(inputs.zinStepUp));
        if (inputs.zinReturn !== undefined) setZinReturn(String(inputs.zinReturn));
        if (inputs.zinYears !== undefined) setZinYears(String(inputs.zinYears));
        if (inputs.zinInflation !== undefined) setZinInflation(String(inputs.zinInflation));
        if (inputs.zinTer !== undefined) setZinTer(String(inputs.zinTer));
        if (inputs.zinTaxActive !== undefined) setZinTaxActive(Boolean(inputs.zinTaxActive));
        if (inputs.zinTaxRate !== undefined) setZinTaxRate(String(inputs.zinTaxRate));
        if (inputs.zinPayout !== undefined) setZinPayout(inputs.zinPayout);
      } else if (scen.type === "entnahme") {
        if (inputs.entInitial !== undefined) setEntInitial(String(inputs.entInitial));
        if (inputs.entMonthly !== undefined) setEntMonthly(String(inputs.entMonthly));
        if (inputs.entAdjustInf !== undefined) setEntAdjustInf(Boolean(inputs.entAdjustInf));
        if (inputs.entHorizon !== undefined) setEntHorizon(String(inputs.entHorizon));
        if (inputs.entReturn !== undefined) setEntReturn(String(inputs.entReturn));
        if (inputs.entInflation !== undefined) setEntInflation(String(inputs.entInflation));
        if (inputs.entTer !== undefined) setEntTer(String(inputs.entTer));
        if (inputs.entTaxActive !== undefined) setEntTaxActive(Boolean(inputs.entTaxActive));
        if (inputs.entTaxRate !== undefined) setEntTaxRate(String(inputs.entTaxRate));
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
          <h1 className="font-heading text-xl text-charcoal">Rechner</h1>
          <p className="text-sm text-slate">
            Simuliere FIRE-Ziel, Zinseszins-Effekt und Entnahmepläne.
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

            fireMode={fireMode}
            setFireMode={setFireMode}
            fireMonthlyNet={fireMonthlyNet}
            setFireMonthlyNet={setFireMonthlyNet}
            fireSavingsRate={fireSavingsRate}
            setFireSavingsRate={setFireSavingsRate}
            fireTargetAge={fireTargetAge}
            setFireTargetAge={setFireTargetAge}
            fireCapital={fireCapital}
            setFireCapital={setFireCapital}
            fireReturn={fireReturn}
            setFireReturn={setFireReturn}
            fireInflation={fireInflation}
            setFireInflation={setFireInflation}
            fireSwr={fireSwr}
            setFireSwr={setFireSwr}
            fireTax={fireTax}
            setFireTax={setFireTax}
            fireTeilfreistellung={fireTeilfreistellung}
            setFireTeilfreistellung={setFireTeilfreistellung}
            fireCapitalDepletion={fireCapitalDepletion}
            setFireCapitalDepletion={setFireCapitalDepletion}
            firePersonId={firePersonId}
            setFirePersonId={setFirePersonId}
            fireResult={fireResult}
            fireChartOption={fireChartOption}
          />
        </TabsContent>

        {/* --- ZINSESZINS TAB --- */}
        <TabsContent value="zinseszins" className="mt-6 space-y-6">
          <ZinseszinsTab
            t={t}
            zinInitial={zinInitial}
            setZinInitial={setZinInitial}
            zinSavings={zinSavings}
            setZinSavings={setZinSavings}
            zinStepUp={zinStepUp}
            setZinStepUp={setZinStepUp}
            zinReturn={zinReturn}
            setZinReturn={setZinReturn}
            zinYears={zinYears}
            setZinYears={setZinYears}
            zinInflation={zinInflation}
            setZinInflation={setZinInflation}
            zinTer={zinTer}
            setZinTer={setZinTer}
            zinTaxActive={zinTaxActive}
            setZinTaxActive={setZinTaxActive}
            zinTaxRate={zinTaxRate}
            setZinTaxRate={setZinTaxRate}
            zinPayout={zinPayout}
            setZinPayout={setZinPayout}
            zinResult={zinResult}
            zinChartOption={zinChartOption}
            zinChartContainerRef={zinChartContainer.ref}
          />
        </TabsContent>

        {/* --- ENTNAHME TAB --- */}
        <TabsContent value="entnahme" className="mt-6 space-y-6">
          <EntnahmeTab
            t={t}
            entInitial={entInitial}
            setEntInitial={setEntInitial}
            entMonthly={entMonthly}
            setEntMonthly={setEntMonthly}
            entAdjustInf={entAdjustInf}
            setEntAdjustInf={setEntAdjustInf}
            entHorizon={entHorizon}
            setEntHorizon={setEntHorizon}
            entReturn={entReturn}
            setEntReturn={setEntReturn}
            entInflation={entInflation}
            setEntInflation={setEntInflation}
            entTer={entTer}
            setEntTer={setEntTer}
            entTaxActive={entTaxActive}
            setEntTaxActive={setEntTaxActive}
            entTaxRate={entTaxRate}
            setEntTaxRate={setEntTaxRate}
            entResult={entResult}
            entChartOption={entChartOption}
            entChartContainerRef={entChartContainer.ref}
          />
        </TabsContent>
      </Tabs>

      {/* --- SCENARIO SAVE & LIST PER TAB --- */}
      <section className="rounded-standard border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <Save className="size-4 text-petrol" /> {t("scenarios.savedTitle")} (
          {activeTab.toUpperCase()})
        </h2>
        <div className="flex gap-2 max-w-md">
          <Input
            placeholder={t("scenarios.placeholder")}
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
          />
          <Button onClick={handleSaveScenario} disabled={!scenarioName.trim()}>
            Speichern
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
                  ({scen.type.toUpperCase()}) ·{" "}
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
