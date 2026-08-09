import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Download, Flame, HelpCircle, Save, Trash2, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatEur } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePersons } from "@/hooks/usePersons";
import { calculateFire } from "@/lib/rechner/fire";
import { calculateZinseszins } from "@/lib/rechner/zinseszins";
import { calculateEntnahme } from "@/lib/rechner/entnahme";
import { deleteScenario, listSavedScenarios, saveScenario, type SavedScenario } from "@/db/repositories/rechner";
import { amountAxisLabel } from "@/lib/charts/theme";
import { useElementWidth } from "@/hooks/useElementWidth";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

const NARROW_CHART_BREAKPOINT = 500;

const RECHNER_STATE_KEY = "klarwert_rechner_persistent_inputs";

function TooltipHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help text-slate hover:text-charcoal">
          <HelpCircle className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

/** Formatiertes Eingabefeld für Euro-Beträge mit Tausendertrennzeichen (Punkt). */
function FormattedEuroInput({
  value,
  onChange,
  className = "",
  placeholder = "",
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
}) {
  function rawVal(str: string) {
    return str.replace(/\./g, "").trim();
  }

  function formatVal(str: string) {
    if (!str) return "";
    const clean = str.replace(/\./g, "").replace(",", ".");
    const parts = clean.split(".");
    const num = parseInt(parts[0], 10);
    if (isNaN(num)) return str;
    const formattedInt = num.toLocaleString("de-DE");
    return parts.length > 1 ? `${formattedInt},${parts[1]}` : formattedInt;
  }

  const [displayVal, setDisplayVal] = useState(() => formatVal(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDisplayVal(formatVal(value));
    }
  }, [value, isFocused]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      className={className}
      value={isFocused ? displayVal : formatVal(value)}
      onFocus={() => {
        setIsFocused(true);
        setDisplayVal(formatVal(value));
      }}
      onChange={(e) => {
        const inputStr = e.target.value;
        const cleaned = rawVal(inputStr);
        onChange(cleaned);
        setDisplayVal(formatVal(cleaned));
      }}
      onBlur={() => {
        setIsFocused(false);
        const cleaned = rawVal(displayVal);
        onChange(cleaned);
        setDisplayVal(formatVal(cleaned));
      }}
    />
  );
}

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
  const [fireMode, setFireMode] = useState<"when_free" | "how_much">(() => getStoredState("fireMode", "when_free"));
  const [fireMonthlyNet, setFireMonthlyNet] = useState(() => getStoredState("fireMonthlyNet", "2500"));
  const [fireReturn, setFireReturn] = useState(() => getStoredState("fireReturn", "6.0"));
  const [fireInflation, setFireInflation] = useState(() => getStoredState("fireInflation", "2.0"));
  const [fireSwr, setFireSwr] = useState(() => getStoredState("fireSwr", "3.5"));
  const [fireTax, setFireTax] = useState(() => getStoredState("fireTax", "26.375"));
  const [fireTeilfreistellung, setFireTeilfreistellung] = useState(() => getStoredState("fireTeilfreistellung", true));
  const [fireCapital, setFireCapital] = useState(() => getStoredState("fireCapital", "50000"));
  const [fireSavingsRate, setFireSavingsRate] = useState(() => getStoredState("fireSavingsRate", "800"));
  const [fireTargetAge, setFireTargetAge] = useState(() => getStoredState("fireTargetAge", "60"));
  const [fireCapitalDepletion, setFireCapitalDepletion] = useState(() => getStoredState("fireCapitalDepletion", false));
  const [firePersonId, setFirePersonId] = useState<string>(() => getStoredState("firePersonId", "all"));

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
  const [zinPayout, setZinPayout] = useState<"ausschüttend" | "thesaurierend">(() => getStoredState("zinPayout", "thesaurierend"));

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
    } catch {}
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
      monthlyNetIncomeCents: Math.round((parseFloat(fireMonthlyNet.replace(/\./g, "")) || 0) * 100),
      expectedReturnPercent: parseFloat(fireReturn) || 0,
      inflationPercent: parseFloat(fireInflation) || 0,
      swrPercent: parseFloat(fireSwr) || 0,
      taxRatePercent: parseFloat(fireTax) || 0,
      teilfreistellung: fireTeilfreistellung,
      currentCapitalCents: Math.round((parseFloat(fireCapital.replace(/\./g, "")) || 0) * 100),
      monthlySavingsRateCents: Math.round((parseFloat(fireSavingsRate.replace(/\./g, "")) || 0) * 100),
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
      yAxis: { type: "value", axisLabel: amountAxisLabel(fireChartContainer.width > 0 && fireChartContainer.width < NARROW_CHART_BREAKPOINT) },
      series: [
        { name: "Einzahlungen", type: "bar", stack: "total", data: contrib, itemStyle: { color: "#4a6fa5" } },
        { name: "Wertzuwachs", type: "bar", stack: "total", data: growth, itemStyle: { color: "#6f9a6d" } },
      ],
    };
  }, [fireResult, fireChartContainer.width]);

  const zinResult = useMemo(() => {
    return calculateZinseszins({
      initialCapitalCents: Math.round((parseFloat(zinInitial.replace(/\./g, "")) || 0) * 100),
      monthlySavingsRateCents: Math.round((parseFloat(zinSavings.replace(/\./g, "")) || 0) * 100),
      annualSavingsIncreasePercent: parseFloat(zinStepUp) || 0,
      interestRatePercent: parseFloat(zinReturn) || 0,
      years: parseInt(zinYears, 10) || 10,
      inflationPercent: parseFloat(zinInflation) || 0,
      terPercent: parseFloat(zinTer) || 0,
      taxActive: zinTaxActive,
      taxRatePercent: parseFloat(zinTaxRate) || 0,
      payoutType: zinPayout,
    });
  }, [zinInitial, zinSavings, zinStepUp, zinReturn, zinYears, zinInflation, zinTer, zinTaxActive, zinTaxRate, zinPayout]);

  const zinChartOption = useMemo(() => {
    const years = zinResult.yearlyPoints.map((p) => p.year);
    const contrib = zinResult.yearlyPoints.map((p) => Math.round(p.contributionsCents / 100));
    const earnings = zinResult.yearlyPoints.map((p) => Math.round(p.earningsCents / 100));

    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["Einzahlungen", "Erträge"], bottom: 0 },
      xAxis: { type: "category", data: years },
      yAxis: { type: "value", axisLabel: amountAxisLabel(zinChartContainer.width > 0 && zinChartContainer.width < NARROW_CHART_BREAKPOINT) },
      series: [
        { name: "Einzahlungen", type: "bar", stack: "total", data: contrib, itemStyle: { color: "#4a6fa5" } },
        { name: "Erträge", type: "bar", stack: "total", data: earnings, itemStyle: { color: "#b79a5b" } },
      ],
    };
  }, [zinResult, zinChartContainer.width]);

  const entResult = useMemo(() => {
    return calculateEntnahme({
      initialCapitalCents: Math.round((parseFloat(entInitial.replace(/\./g, "")) || 0) * 100),
      monthlyWithdrawalCents: Math.round((parseFloat(entMonthly.replace(/\./g, "")) || 0) * 100),
      adjustForInflation: entAdjustInf,
      horizonYears: parseInt(entHorizon, 10) || 30,
      interestRatePercent: parseFloat(entReturn) || 0,
      inflationPercent: parseFloat(entInflation) || 0,
      terPercent: parseFloat(entTer) || 0,
      taxActive: entTaxActive,
      taxRatePercent: parseFloat(entTaxRate) || 0,
      userAge: fireCurrentAge,
    });
  }, [entInitial, entMonthly, entAdjustInf, entHorizon, entReturn, entInflation, entTer, entTaxActive, entTaxRate, fireCurrentAge]);

  const entChartOption = useMemo(() => {
    const years = entResult.yearlyPoints.map((p) => p.year);
    const cap = entResult.yearlyPoints.map((p) => Math.round(p.capitalRemainingCents / 100));

    return {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: years },
      yAxis: { type: "value", axisLabel: amountAxisLabel(entChartContainer.width > 0 && entChartContainer.width < NARROW_CHART_BREAKPOINT) },
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
    toast.success("Szenario gespeichert");
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
        if (inputs.fireTeilfreistellung !== undefined) setFireTeilfreistellung(Boolean(inputs.fireTeilfreistellung));
        if (inputs.fireCapital !== undefined) setFireCapital(String(inputs.fireCapital));
        if (inputs.fireSavingsRate !== undefined) setFireSavingsRate(String(inputs.fireSavingsRate));
        if (inputs.fireTargetAge !== undefined) setFireTargetAge(String(inputs.fireTargetAge));
        if (inputs.fireCapitalDepletion !== undefined) setFireCapitalDepletion(Boolean(inputs.fireCapitalDepletion));
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
      toast.success(`Szenario "${scen.name}" geladen`);
    } catch {
      showErrorToast("Fehler beim Laden des Szenarios");
    }
  }

  function handleDeleteScenario(id: string) {
    deleteScenario(id);
    setSavedList(listSavedScenarios());
    toast.success("Szenario gelöscht");
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
          <p className="text-sm text-slate">Simuliere FIRE-Ziel, Zinseszins-Effekt und Entnahmepläne.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="fire" className="gap-2">
            <Flame className="size-4" /> FIRE
          </TabsTrigger>
          <TabsTrigger value="zinseszins" className="gap-2">
            <TrendingUp className="size-4" /> Zinseszins
          </TabsTrigger>
          <TabsTrigger value="entnahme" className="gap-2">
            <Wallet className="size-4" /> Entnahmeplan
          </TabsTrigger>
        </TabsList>

        {/* --- FIRE TAB --- */}
        <TabsContent value="fire" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
            <div className="space-y-4 rounded-standard border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-charcoal">Eingaben FIRE</h2>

              <div className="space-y-1.5">
                <Label>Berechnungsmodus</Label>
                <Select value={fireMode} onValueChange={(v: any) => setFireMode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="when_free">Wann bin ich frei?</SelectItem>
                    <SelectItem value="how_much">Wieviel muss ich sparen?</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label>Netto-Wunschbetrag (€ / mtl.)</Label>
                  <TooltipHelp text="Monatlicher Betrag, der dir nach Steuern zur Verfügung stehen soll." />
                </div>
                <FormattedEuroInput value={fireMonthlyNet} onChange={setFireMonthlyNet} />
              </div>

              {fireMode === "when_free" ? (
                <div className="space-y-1.5">
                  <Label>Monatliche Sparrate (€)</Label>
                  <FormattedEuroInput value={fireSavingsRate} onChange={setFireSavingsRate} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Wunsch-Eintrittsalter</Label>
                  <Input value={fireTargetAge} onChange={(e) => setFireTargetAge(e.target.value)} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Rendite (% p.a.)</Label>
                    <TooltipHelp text="Erwartete Wertentwicklung vor Steuern (z. B. 6% für Aktien-ETF)." />
                  </div>
                  <Input value={fireReturn} onChange={(e) => setFireReturn(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Inflation (% p.a.)</Label>
                  <Input value={fireInflation} onChange={(e) => setFireInflation(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Entnahmerate (% SWR)</Label>
                    <TooltipHelp text="Safe Withdrawal Rate (z. B. 3,5% oder 4%)." />
                  </div>
                  <Input value={fireSwr} onChange={(e) => setFireSwr(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Steuersatz (%)</Label>
                  <Input value={fireTax} onChange={(e) => setFireTax(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Vorhandenes Kapital (€)</Label>
                <FormattedEuroInput value={fireCapital} onChange={setFireCapital} />
              </div>

              <div className="space-y-1.5">
                <Label>Person für Alter</Label>
                <Select value={firePersonId} onValueChange={setFirePersonId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Profil-Default ({fireCurrentAge} Jahre)</SelectItem>
                    {persons?.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} {p.birth_year ? `(${new Date().getFullYear() - p.birth_year} Jahre)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  id="fire-tf"
                  checked={fireTeilfreistellung}
                  onCheckedChange={(c) => setFireTeilfreistellung(c === true)}
                />
                <label htmlFor="fire-tf" className="text-xs text-charcoal">
                  Teilfreistellung 30% (Aktien-ETF)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="fire-kv"
                  checked={fireCapitalDepletion}
                  onCheckedChange={(c) => setFireCapitalDepletion(c === true)}
                />
                <label htmlFor="fire-kv" className="text-xs text-charcoal">
                  Mit Kapitalverzehr (bis Alter 100)
                </label>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-standard border border-border bg-card p-4">
                  <span className="text-xs text-slate">Ziel-Jahr / Alter</span>
                  <div className="mt-1 text-xl font-bold text-charcoal">
                    {fireResult.fireYear} ({fireResult.fireAge} J.)
                  </div>
                  <span className="text-xs text-petrol">in {fireResult.yearsToFire} Jahren</span>
                </div>
                <div className="rounded-standard border border-border bg-card p-4">
                  <span className="text-xs text-slate">Benötigtes Zielkapital</span>
                  <div className="mt-1 text-xl font-bold text-charcoal">
                    {formatEur(fireResult.requiredCapitalCents)}
                  </div>
                </div>
                <div className="rounded-standard border border-border bg-card p-4">
                  <span className="text-xs text-slate">Erforderliche Sparrate</span>
                  <div className="mt-1 text-xl font-bold text-charcoal">
                    {formatEur(fireResult.monthlySavingsRateCents)} / mtl.
                  </div>
                </div>
              </div>

              <div className="rounded-standard border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-charcoal">Kapitalaufbau-Verlauf</h3>
                <div ref={fireChartContainer.ref}>
                  <ReactECharts option={fireChartOption} style={{ height: 300, width: "100%" }} />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* --- ZINSESZINS TAB --- */}
        <TabsContent value="zinseszins" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
            <div className="space-y-4 rounded-standard border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-charcoal">Eingaben Zinseszins</h2>
              <div className="space-y-1.5">
                <Label>Anfangskapital (€)</Label>
                <FormattedEuroInput value={zinInitial} onChange={setZinInitial} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sparrate (€ mtl.)</Label>
                  <FormattedEuroInput value={zinSavings} onChange={setZinSavings} />
                </div>
                <div className="space-y-1.5">
                  <Label>Dynamik (% p.a.)</Label>
                  <Input value={zinStepUp} onChange={(e) => setZinStepUp(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Zinssatz (% p.a.)</Label>
                  <Input value={zinReturn} onChange={(e) => setZinReturn(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Laufzeit (Jahre)</Label>
                  <Input value={zinYears} onChange={(e) => setZinYears(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Inflation (%)</Label>
                  <Input value={zinInflation} onChange={(e) => setZinInflation(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>TER / Gebühr (%)</Label>
                  <Input value={zinTer} onChange={(e) => setZinTer(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Ertragsart</Label>
                <Select value={zinPayout} onValueChange={(v: any) => setZinPayout(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thesaurierend">Thesaurierend (Steuer am Ende)</SelectItem>
                    <SelectItem value="ausschüttend">Ausschüttend (Steuer jährlich)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="zin-tax"
                  checked={zinTaxActive}
                  onCheckedChange={(c) => setZinTaxActive(c === true)}
                />
                <label htmlFor="zin-tax" className="text-xs text-charcoal">
                  Abgeltungsteuer berücksichtigen
                </label>
              </div>
              {zinTaxActive && (
                <div className="space-y-1.5">
                  <Label>Steuersatz (% inkl. Soli)</Label>
                  <Input value={zinTaxRate} onChange={(e) => setZinTaxRate(e.target.value)} />
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-standard border border-border bg-card p-4">
                  <span className="text-xs text-slate">Endkapital (Nominal)</span>
                  <div className="mt-1 text-xl font-bold text-charcoal">
                    {formatEur(zinResult.endCapitalNominalCents)}
                  </div>
                  <span className="text-xs text-slate">Real: {formatEur(zinResult.endCapitalRealCents)}</span>
                </div>
                <div className="rounded-standard border border-border bg-card p-4">
                  <span className="text-xs text-slate">Summe Erträge</span>
                  <div className="mt-1 text-xl font-bold text-sage">
                    {formatEur(zinResult.totalEarningsCents)}
                  </div>
                </div>
                <div className="rounded-standard border border-border bg-card p-4">
                  <span className="text-xs text-slate">Gezahlte Steuern</span>
                  <div className="mt-1 text-xl font-bold text-brick">
                    {formatEur(zinResult.totalTaxesCents)}
                  </div>
                </div>
              </div>

              <div className="rounded-standard border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-charcoal">Vermögensentwicklung</h3>
                <div ref={zinChartContainer.ref}>
                  <ReactECharts option={zinChartOption} style={{ height: 300, width: "100%" }} />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* --- ENTNAHME TAB --- */}
        <TabsContent value="entnahme" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
            <div className="space-y-4 rounded-standard border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-charcoal">Eingaben Entnahmeplan</h2>
              <div className="space-y-1.5">
                <Label>Startkapital (€)</Label>
                <FormattedEuroInput value={entInitial} onChange={setEntInitial} />
              </div>
              <div className="space-y-1.5">
                <Label>Monatliche Entnahme (€)</Label>
                <FormattedEuroInput value={entMonthly} onChange={setEntMonthly} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Rendite (% p.a.)</Label>
                  <Input value={entReturn} onChange={(e) => setEntReturn(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Horizont (Jahre)</Label>
                  <Input value={entHorizon} onChange={(e) => setEntHorizon(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Inflation (%)</Label>
                  <Input value={entInflation} onChange={(e) => setEntInflation(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>TER / Gebühr (%)</Label>
                  <Input value={entTer} onChange={(e) => setEntTer(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  id="ent-inf"
                  checked={entAdjustInf}
                  onCheckedChange={(c) => setEntAdjustInf(c === true)}
                />
                <label htmlFor="ent-inf" className="text-xs text-charcoal">
                  Entnahme jährlich mit Inflation steigern
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ent-tax"
                  checked={entTaxActive}
                  onCheckedChange={(c) => setEntTaxActive(c === true)}
                />
                <label htmlFor="ent-tax" className="text-xs text-charcoal">
                  Abgeltungsteuer auf Erträge berücksichtigen
                </label>
              </div>
              {entTaxActive && (
                <div className="space-y-1.5">
                  <Label>Steuersatz (%)</Label>
                  <Input value={entTaxRate} onChange={(e) => setEntTaxRate(e.target.value)} />
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-standard border border-border bg-card p-4">
                  <span className="text-xs text-slate">Restkapital nach Horizont</span>
                  <div className="mt-1 text-xl font-bold text-charcoal">
                    {formatEur(entResult.endBalanceCents)}
                  </div>
                </div>
                <div className="rounded-standard border border-border bg-card p-4">
                  <span className="text-xs text-slate">Kapital reicht bis</span>
                  <div className="mt-1 text-xl font-bold text-charcoal">
                    {entResult.capitalDepletedInYear ? `${entResult.capitalDepletedInYear}` : "Ende des Horizonts"}
                  </div>
                  {entResult.capitalDepletedAtAge && (
                    <span className="text-xs text-brick">Alter {entResult.capitalDepletedAtAge}</span>
                  )}
                </div>
                <div className="rounded-standard border border-border bg-card p-4">
                  <span className="text-xs text-slate">Gesamtentnahme</span>
                  <div className="mt-1 text-xl font-bold text-sage">
                    {formatEur(entResult.totalWithdrawalsCents)}
                  </div>
                </div>
              </div>

              <div className="rounded-standard border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-charcoal">Entnahmeverlauf</h3>
                <div ref={entChartContainer.ref}>
                  <ReactECharts option={entChartOption} style={{ height: 300, width: "100%" }} />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* --- SCENARIO SAVE & LIST PER TAB --- */}
      <section className="rounded-standard border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <Save className="size-4 text-petrol" /> Gespeicherte Szenarien ({activeTab.toUpperCase()})
        </h2>
        <div className="flex gap-2 max-w-md">
          <Input
            placeholder={`Szenario Name für ${activeTab.toUpperCase()}…`}
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
          />
          <Button onClick={handleSaveScenario} disabled={!scenarioName.trim()}>
            Speichern
          </Button>
        </div>

        <div className="space-y-2 pt-2">
          {tabSavedScenarios.map((scen) => (
            <div key={scen.id} className="flex items-center justify-between gap-3 rounded-klein bg-paper p-3 text-xs">
              <div>
                <span className="font-semibold text-charcoal">{scen.name}</span>
                <span className="ml-2 text-slate">({scen.type.toUpperCase()}) · {formatDate(scen.createdAt.slice(0, 10), dateDisplayFormat)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleLoadScenario(scen)}>
                  <Download className="size-3" /> Laden
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteScenario(scen.id)}>
                  <Trash2 className="size-3 text-brick" />
                </Button>
              </div>
            </div>
          ))}
          {tabSavedScenarios.length === 0 && (
            <p className="text-xs text-slate">Keine gespeicherten Szenarien für {activeTab.toUpperCase()}.</p>
          )}
        </div>
      </section>
    </div>
  );
}
