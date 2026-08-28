#!/usr/bin/env node
/**
 * Setzt die Versionsnummer synchron in allen drei Stellen, die sie kennen müssen
 * (package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml) - eine davon zu vergessen
 * lässt den Release-Workflow inkonsistente Artefakte bauen (siehe CONTRIBUTING.md "Release-Prozess").
 *
 * Nutzung: node scripts/bump-version.mjs 0.2.0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const newVersion = process.argv[2];

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error("Nutzung: node scripts/bump-version.mjs <X.Y.Z>");
  process.exit(1);
}

function updateJson(relPath, get, set) {
  const filePath = path.join(root, relPath);
  const content = readFileSync(filePath, "utf-8");
  const data = JSON.parse(content);
  const old = get(data);
  set(data, newVersion);
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`${relPath}: ${old} -> ${newVersion}`);
}

updateJson("package.json", (d) => d.version, (d, v) => { d.version = v; });
updateJson("src-tauri/tauri.conf.json", (d) => d.version, (d, v) => { d.version = v; });

const cargoPath = path.join(root, "src-tauri/Cargo.toml");
const cargoContent = readFileSync(cargoPath, "utf-8");
const oldCargoVersion = cargoContent.match(/^version = "([^"]+)"/m)?.[1];
const updatedCargo = cargoContent.replace(/^version = "[^"]+"/m, `version = "${newVersion}"`);
writeFileSync(cargoPath, updatedCargo);
console.log(`src-tauri/Cargo.toml: ${oldCargoVersion} -> ${newVersion}`);

// Hält package-lock.json's Top-Level-"version"-Feld synchron, ohne Abhängigkeiten neu aufzulösen.
execFileSync("npm", ["install", "--package-lock-only"], { cwd: root, stdio: "inherit" });

console.log("\nNächste Schritte:");
console.log(`  git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock`);
console.log(`  git commit -m "chore: release v${newVersion}"`);
console.log(`  git push`);
console.log(`  git tag v${newVersion}`);
console.log(`  git push origin v${newVersion}`);
