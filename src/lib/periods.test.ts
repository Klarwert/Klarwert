import { describe, it, expect, beforeEach } from "vitest";
import { getPeriodRange } from "@/lib/periods";
import i18n from "@/i18n";

describe("getPeriodRange", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("de");
  });

  it("gibt den Monatsnamen auf Deutsch aus, wenn die Sprache Deutsch ist", () => {
    const range = getPeriodRange("month", new Date("2024-02-15T00:00:00Z"));
    expect(range.label).toBe("Februar 2024");
  });

  it("gibt den Monatsnamen auf Englisch aus, wenn die Sprache Englisch ist", async () => {
    // Regression: die Monatsbeschriftung im Zeitraum-Umschalter (Übersicht) war fest auf
    // date-fns' deutsches Locale verdrahtet - "Februar" erschien auch bei englischer UI-Sprache.
    await i18n.changeLanguage("en");
    const range = getPeriodRange("month", new Date("2024-02-15T00:00:00Z"));
    expect(range.label).toBe("February 2024");
  });

  it("übersetzt die Kalenderwoche-Beschriftung", async () => {
    const deRange = getPeriodRange("week", new Date("2024-02-15T00:00:00Z"));
    expect(deRange.label).toMatch(/^KW \d+ · 2024$/);
    await i18n.changeLanguage("en");
    const enRange = getPeriodRange("week", new Date("2024-02-15T00:00:00Z"));
    expect(enRange.label).toMatch(/^Week \d+ · 2024$/);
  });
});
