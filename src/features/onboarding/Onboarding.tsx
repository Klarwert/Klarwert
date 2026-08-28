import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StepDots } from "@/components/StepDots";
import { X } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { createPerson } from "@/db/repositories/persons";
import { seedDemoData } from "@/db/demoData";
import { showErrorToast } from "@/lib/errorToast";

const CURRENCIES = ["EUR", "USD", "CHF", "GBP"];

type Step = 0 | 1 | 2;

export function Onboarding() {
  const { t } = useTranslation("onboarding");
  const [step, setStep] = useState<Step>(0);
  const [primaryName, setPrimaryName] = useState("");
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [currency, setCurrency] = useState("EUR");
  const [submitting, setSubmitting] = useState(false);

  const setCurrencySetting = useSettingsStore((s) => s.setCurrency);
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const requestOpenCreateAsset = useUiStore((s) => s.requestOpenCreateAsset);

  async function handleSkip() {
    setSubmitting(true);
    try {
      await createPerson({ name: "Ich" });
      await completeOnboarding();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExploreDemo() {
    setSubmitting(true);
    try {
      await seedDemoData();
      await completeOnboarding();
    } catch (e) {
      showErrorToast(t("step0.demoError", { error: String(e) }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePersonsSubmit() {
    const names = [primaryName, ...extraNames].map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setSubmitting(true);
    try {
      await setCurrencySetting(currency);
      for (const name of names) {
        await createPerson({ name });
      }
      setStep(2);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateAccount() {
    setSubmitting(true);
    try {
      await completeOnboarding();
      requestOpenCreateAsset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-[480px] rounded-standard border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <StepDots total={3} current={step} variant="cumulative" />
        </div>

        {step === 0 && (
          <div className="space-y-6 text-center">
            <div>
              <h1 className="font-heading text-2xl text-charcoal">{t("step0.title")}</h1>
              <p className="mt-2 text-sm text-slate">{t("step0.description")}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setStep(1)} disabled={submitting}>
                {t("step0.start")}
              </Button>
              <Button variant="ghost" onClick={() => void handleSkip()} disabled={submitting}>
                {t("step0.skip")}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex w-full">
                    <Button
                      variant="ghost"
                      className="w-full"
                      disabled={submitting}
                      onClick={() => void handleExploreDemo()}
                    >
                      {t("step0.exploreDemo")}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("step0.exploreDemoTooltip")}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {step === 1 && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void handlePersonsSubmit();
            }}
          >
            <div>
              <h1 className="font-heading text-xl text-charcoal">{t("step1.title")}</h1>
              <p className="mt-1 text-sm text-slate">{t("step1.description")}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="primary-name">{t("step1.yourName")}</Label>
              <Input
                id="primary-name"
                value={primaryName}
                onChange={(e) => setPrimaryName(e.target.value)}
                required
                maxLength={60}
                autoFocus
              />
            </div>

            {extraNames.map((name, i) => (
              <div className="flex items-end gap-2" key={i}>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor={`extra-name-${i}`}>{t("step1.additionalPerson")}</Label>
                  <Input
                    id={`extra-name-${i}`}
                    value={name}
                    maxLength={60}
                    onChange={(e) => {
                      const next = [...extraNames];
                      next[i] = e.target.value;
                      setExtraNames(next);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("step1.removeAdditionalPerson")}
                  onClick={() => setExtraNames(extraNames.filter((_, idx) => idx !== i))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExtraNames([...extraNames, ""])}
            >
              {t("step1.addPerson")}
            </Button>

            <div className="space-y-1.5">
              <Label htmlFor="currency">{t("step1.currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={submitting || !primaryName.trim()}>
              {t("step1.continue")}
            </Button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-6 text-center">
            <div>
              <h1 className="font-heading text-xl text-charcoal">{t("step2.title")}</h1>
              <p className="mt-2 text-sm text-slate">{t("step2.description")}</p>
            </div>
            <Button className="w-full" onClick={() => void handleCreateAccount()} disabled={submitting}>
              {t("step2.createAccount")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
