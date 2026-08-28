import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import rechnerDe from "./locales/de/rechner.json";
import rechnerEn from "./locales/en/rechner.json";
import appDe from "./locales/de/app.json";
import appEn from "./locales/en/app.json";
import transaktionenDe from "./locales/de/transaktionen.json";
import transaktionenEn from "./locales/en/transaktionen.json";
import uebersichtDe from "./locales/de/uebersicht.json";
import uebersichtEn from "./locales/en/uebersicht.json";
import vermoegenDe from "./locales/de/vermoegen.json";
import vermoegenEn from "./locales/en/vermoegen.json";
import kategorienDe from "./locales/de/kategorien.json";
import kategorienEn from "./locales/en/kategorien.json";
import budgetsDe from "./locales/de/budgets.json";
import budgetsEn from "./locales/en/budgets.json";
import profilDe from "./locales/de/profil.json";
import profilEn from "./locales/en/profil.json";
import importDe from "./locales/de/import.json";
import importEn from "./locales/en/import.json";
import steuerDe from "./locales/de/steuer.json";
import steuerEn from "./locales/en/steuer.json";
import vertrageDe from "./locales/de/vertraege.json";
import vertrageEn from "./locales/en/vertraege.json";
import sammlungenDe from "./locales/de/sammlungen.json";
import sammlungenEn from "./locales/en/sammlungen.json";
import benachrichtigungenDe from "./locales/de/benachrichtigungen.json";
import benachrichtigungenEn from "./locales/en/benachrichtigungen.json";
import depotDe from "./locales/de/depot.json";
import depotEn from "./locales/en/depot.json";
import onboardingDe from "./locales/de/onboarding.json";
import onboardingEn from "./locales/en/onboarding.json";

export const defaultNS = "app";
export const resources = {
  de: {
    app: appDe,
    rechner: rechnerDe,
    transaktionen: transaktionenDe,
    uebersicht: uebersichtDe,
    vermoegen: vermoegenDe,
    kategorien: kategorienDe,
    budgets: budgetsDe,
    profil: profilDe,
    import: importDe,
    steuer: steuerDe,
    vertraege: vertrageDe,
    sammlungen: sammlungenDe,
    benachrichtigungen: benachrichtigungenDe,
    depot: depotDe,
    onboarding: onboardingDe,
  },
  en: {
    app: appEn,
    rechner: rechnerEn,
    transaktionen: transaktionenEn,
    uebersicht: uebersichtEn,
    vermoegen: vermoegenEn,
    kategorien: kategorienEn,
    budgets: budgetsEn,
    profil: profilEn,
    import: importEn,
    steuer: steuerEn,
    vertraege: vertrageEn,
    sammlungen: sammlungenEn,
    benachrichtigungen: benachrichtigungenEn,
    depot: depotEn,
    onboarding: onboardingEn,
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: "de",
  fallbackLng: "de",
  ns: ["app", "rechner", "transaktionen", "uebersicht", "vermoegen", "kategorien", "budgets", "profil", "import", "steuer", "vertraege", "sammlungen", "benachrichtigungen", "depot", "onboarding"],
  defaultNS,
  interpolation: {
    escapeValue: false, // react already safes from xss
  },
});

export default i18n;
