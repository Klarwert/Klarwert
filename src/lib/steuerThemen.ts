import i18n from "@/i18n";
import type { SteuerThema } from "@/db/repositories/steuer";

/**
 * Übersetzt den Anzeigenamen eines Standard-Steuer-Themas über seinen stabilen `template_key`
 * (siehe steuer.ts, DEFAULT_THEMEN) - nutzerangelegte Themen haben keinen template_key und
 * behalten immer ihren eigenen, unübersetzten Namen. Analog zu translateCategoryName()
 * (useCategories.ts) - aus demselben Grund NICHT in listSteuerThemen() selbst angewendet:
 * SteuerThemaEditorModal befüllt sein Namensfeld direkt aus thema.name.
 */
export function translateSteuerThemaName(thema: Pick<SteuerThema, "name" | "template_key">): string {
  if (!thema.template_key) return thema.name;
  return i18n.t(`steuer:themen.${thema.template_key}`, { defaultValue: thema.name });
}
