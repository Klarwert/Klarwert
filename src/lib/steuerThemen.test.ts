import { describe, it, expect, beforeEach } from "vitest";
import { translateSteuerThemaName } from "@/lib/steuerThemen";
import i18n from "@/i18n";

describe("translateSteuerThemaName", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("de");
  });

  it("übersetzt Standard-Themen über ihren template_key", async () => {
    const thema = { name: "Versicherungen & Vorsorge", template_key: "versicherung_vorsorge" };
    expect(translateSteuerThemaName(thema)).toBe("Versicherungen & Vorsorge");
    await i18n.changeLanguage("en");
    expect(translateSteuerThemaName(thema)).toBe("Insurance & Provisions");
  });

  it("behält den rohen Namen für nutzerangelegte Themen (kein template_key)", async () => {
    const thema = { name: "Mein eigenes Steuerthema", template_key: null };
    await i18n.changeLanguage("en");
    expect(translateSteuerThemaName(thema)).toBe("Mein eigenes Steuerthema");
  });
});
