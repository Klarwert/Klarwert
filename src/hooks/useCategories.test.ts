import { describe, it, expect, beforeEach } from "vitest";
import { translateCategoryName, groupCategories } from "@/hooks/useCategories";
import type { Category } from "@/db/types";
import i18n from "@/i18n";

function makeCategory(overrides: Partial<Category>): Category {
  return {
    id: 1,
    name: "Wohnen",
    color: "#000000",
    icon: null,
    direction: "ausgabe",
    parent_id: null,
    is_template: 1,
    is_system: 0,
    is_hidden: 0,
    sort_order: 0,
    is_deleted: 0,
    template_key: null,
    ...overrides,
  };
}

describe("translateCategoryName", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("de");
  });

  it("übersetzt Template-Kategorien über ihren template_key", async () => {
    const category = makeCategory({ name: "Wohnen", template_key: "wohnen" });
    expect(translateCategoryName(category)).toBe("Wohnen");
    await i18n.changeLanguage("en");
    expect(translateCategoryName(category)).toBe("Housing");
  });

  it("behält den rohen Namen für nutzerangelegte Kategorien (kein template_key)", async () => {
    const category = makeCategory({ name: "Mein eigenes Hobby", template_key: null });
    expect(translateCategoryName(category)).toBe("Mein eigenes Hobby");
    await i18n.changeLanguage("en");
    // Regression: ein Übersetzen anhand des Namens statt des template_key würde eine eigene
    // Kategorie fälschlich unverändert lassen oder (schlimmer) verändern - hier zählt: sie bleibt
    // exakt der vom Nutzer eingegebene Text, unabhängig von der Sprache.
    expect(translateCategoryName(category)).toBe("Mein eigenes Hobby");
  });

  it("fällt auf den gespeicherten Namen zurück, wenn kein Übersetzungsschlüssel existiert", () => {
    const category = makeCategory({ name: "Alter Key ohne Übersetzung", template_key: "nicht_existent_xyz" });
    expect(translateCategoryName(category)).toBe("Alter Key ohne Übersetzung");
  });
});

describe("groupCategories", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("de");
  });

  it("übersetzt Eltern- und Kind-Labels in gruppierten Optionen", async () => {
    const parent = makeCategory({ id: 1, name: "Wohnen", template_key: "wohnen", parent_id: null });
    const child = makeCategory({ id: 2, name: "Strom", template_key: "wohnen.strom", parent_id: 1 });
    await i18n.changeLanguage("en");
    const groups = groupCategories([parent, child]);
    expect(groups[0].options[0].label).toBe("Housing");
    expect(groups[0].options[1].label).toBe("Housing · Electricity");
  });
});
