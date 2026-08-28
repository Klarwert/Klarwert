import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";
import i18nextPlugin from "eslint-plugin-i18next";

/**
 * Typ-gestütztes Linting bewusst statt Biome (siehe prompt-architektur-haertung.md A2):
 * `no-floating-promises`/`no-misused-promises` fangen vergessene `await` bei DB-Aufrufen –
 * eine reale, wiederkehrende Fehlerquelle in dieser Codebasis (Repository-Schicht, Pipeline).
 */
export default tseslint.config(
  { ignores: ["dist", "src-tauri", "node_modules"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Bewusst nur die beiden klassischen Regeln, nicht `reactHooks.configs.recommended` (v7
      // bündelt dort das volle React-Compiler-Regelwerk, z. B. `set-state-in-effect` /
      // `preserve-manual-memoization` - das wäre ein eigener, großer Refactor über viele
      // bestehende Komponenten hinweg, nicht Teil dieser Härtungs-Sitzung).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "off",

      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Diese drei bewusst entschärft: die Codebasis nutzt weitverbreitet `any` an DB-Grenzen
      // (roher SQLite-Rückgabewert) und nicht-null-Assertions nach expliziten Guards - eine
      // vollständige Verschärfung wäre eine eigene, große Aufräum-Runde, kein Teil dieser Härtung.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",

      // Query-Builder-Code (Repositories) erhöht den SQL-Platzhalter-Zähler durchgehend per
      // `i++`/`i += 1` für Konsistenz, auch wenn die letzte Erhöhung in einer Funktion technisch
      // ungelesen bleibt - kein Bug, nur dieser Stil. Global aus statt 10+ Einzelstellen anzupassen.
      "no-useless-assignment": "off",

      // src/lib/csv.ts fügt bewusst ein UTF-8-BOM (﻿) in ein Template-Literal ein (Excel
      // erkennt CSV-Encoding sonst falsch) - kein irregulärer Whitespace-Bug.
      "no-irregular-whitespace": ["error", { skipTemplates: true }],
    },
  },
  {
    // Test-Double, das die async-Schnittstelle von @tauri-apps/plugin-sql's `Database`
    // nachbildet (node:sqlite ist synchron) - `async` ist hier Interface-Konformität, kein
    // vergessenes await.
    files: ["src/test/sqliteTestDb.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // C6: Lint-Regel gegen hartkodierte Strings in migrierten Namespaces (Proof of Concept)
    files: ["src/features/rechner/**/*.{ts,tsx}"],
    plugins: {
      i18next: i18nextPlugin,
    },
    rules: {
      "i18next/no-literal-string": ["error", {
        markupOnly: true,
        ignoreAttribute: ["value", "className", "variant", "size", "type", "id", "htmlFor", "style", "fill", "stroke", "width", "height", "d", "viewBox"]
      }],
    },
  },
  eslintConfigPrettier,
);
