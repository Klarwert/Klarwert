/**
 * Generiert ein JSON-Backup (100k Transaktionen) zum Testen der Performance.
 * Das erzeugte Backup kann in der App über Profil -> Einstellungen importiert werden.
 */

import { writeFileSync } from "fs";

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function run() {
  console.log("Generating 100k transactions performance fixture...");

  const transactions = [];
  const start = new Date(2020, 0, 1);
  const end = new Date(2026, 0, 1);

  const counterparties = ["REWE", "EDEKA", "Amazon", "Shell", "Telekom", "Vermieter", "Arbeitgeber", "Netflix", "Spotify", "Tankstelle", "Bäcker", "Restaurant"];

  for (let i = 1; i <= 100000; i++) {
    const d = randomDate(start, end).toISOString().split("T")[0];
    const amount = Math.floor((Math.random() * 20000 - 10000)); // -100.00 bis 100.00 EUR in Cents
    const cp = counterparties[Math.floor(Math.random() * counterparties.length)];
    
    transactions.push({
      id: i,
      asset_id: 1, // Wir nehmen an, dass ein Konto mit ID 1 existiert (wird beim Import u. U. angelegt oder miterzeugt)
      import_id: null,
      external_id: `EXT-${i}`,
      booking_date: d,
      value_date: d,
      amount_cents: amount,
      counterparty: cp,
      purpose: `Testbuchung ${i}`,
      category_id: null, // Keine Kategorie, der Nutzer kann Auto-Regeln anwenden
      is_ignored: 0,
      is_deleted: 0,
      rule_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const backupData = {
    version: 25, // Aktuelle DB Migration Version (wie in migrate.ts)
    exported_at: new Date().toISOString(),
    tables: {
      assets: [
        {
          id: 1,
          name: "Testkonto (Perf)",
          type: "cash",
          asset_class: "cash",
          color: "#2563EB",
          is_deleted: 0,
        }
      ],
      transactions: transactions
    }
  };

  writeFileSync("perf-100k-backup.json", JSON.stringify(backupData), "utf8");
  console.log("Done! Wrote perf-100k-backup.json");
}

run();
