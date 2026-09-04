#!/usr/bin/env node
/**
 * Vergleicht jede de/-Namespace-Datei mit ihrem en/-Gegenstück (und umgekehrt) und meldet fehlende
 * oder überzählige Schlüssel. Läuft rekursiv über verschachtelte Objekte (z. B. "settingsValues.currency.EUR").
 * Exit-Code 1 bei Abweichungen, damit es als CI-Schritt scheitern kann - siehe test.yml.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const deDir = path.join(root, "src/locales/de");
const enDir = path.join(root, "src/locales/en");

function collectKeys(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const deFiles = new Set(readdirSync(deDir).filter((f) => f.endsWith(".json")));
const enFiles = new Set(readdirSync(enDir).filter((f) => f.endsWith(".json")));

let hasError = false;

for (const file of new Set([...deFiles, ...enFiles])) {
  const namespace = file.replace(/\.json$/, "");
  if (!deFiles.has(file)) {
    console.error(`✗ ${namespace}: existiert nur in en/, nicht in de/`);
    hasError = true;
    continue;
  }
  if (!enFiles.has(file)) {
    console.error(`✗ ${namespace}: existiert nur in de/, nicht in en/`);
    hasError = true;
    continue;
  }

  const de = JSON.parse(readFileSync(path.join(deDir, file), "utf-8"));
  const en = JSON.parse(readFileSync(path.join(enDir, file), "utf-8"));
  const deKeys = new Set(collectKeys(de));
  const enKeys = new Set(collectKeys(en));

  const missingInEn = [...deKeys].filter((k) => !enKeys.has(k));
  const missingInDe = [...enKeys].filter((k) => !deKeys.has(k));

  if (missingInEn.length > 0) {
    hasError = true;
    console.error(`✗ ${namespace}: fehlt in en/ - ${missingInEn.join(", ")}`);
  }
  if (missingInDe.length > 0) {
    hasError = true;
    console.error(`✗ ${namespace}: fehlt in de/ - ${missingInDe.join(", ")}`);
  }
}

if (hasError) {
  console.error("\ni18n-Vollständigkeitsprüfung fehlgeschlagen.");
  process.exit(1);
} else {
  console.log(`✓ Alle ${deFiles.size} Namespaces haben identische Schlüsselmengen in de/ und en/.`);
}
