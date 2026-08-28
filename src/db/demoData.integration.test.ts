import { beforeAll, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { seedDemoData } from "@/db/demoData";

/**
 * Rauchtest für den Demo-Daten-Generator (Onboarding "Mit Demo-Daten erkunden"): läuft gegen eine
 * echte SQLite-Engine, prüft, dass er fehlerfrei durchläuft und ein plausibles, größtenteils
 * automatisch kategorisiertes Ergebnis erzeugt - der eigentliche Zweck ist der Praxisbeweis, dass
 * die Händler-Datenbank echte, realistische Empfängertexte tatsächlich automatisch zuordnet.
 */
beforeAll(async () => {
  __setTestDatabase(createSqliteTestDatabase());
  await runMigrations();
});

describe("seedDemoData", () => {
  it("erzeugt Personen, Konten und mehrere hundert Transaktionen ohne Fehler", async () => {
    await expect(seedDemoData()).resolves.not.toThrow();

    const db = await getDb();
    const persons = await db.select<{ count: number }[]>("select count(*) as count from persons");
    expect(persons[0].count).toBe(3);

    const assets = await db.select<{ count: number }[]>("select count(*) as count from assets where is_deleted = 0");
    expect(assets[0].count).toBe(4);

    // Schwelle bewusst unter dem mathematischen Minimum pro Monat (feste Positionen + Mindestanzahl
    // aller Zufalls-Ranges, ohne die rein optionalen Posten wie Versicherung/Bahn/Spielzeug) über
    // HISTORY_MONTHS=6 Monate - der Test darf nicht vom Ausgang des Zufallsgenerators abhängen.
    const txCount = await db.select<{ count: number }[]>("select count(*) as count from transactions where is_deleted = 0");
    expect(txCount[0].count).toBeGreaterThan(150);
  });

  it("kategorisiert die Mehrheit der Supermarkt-/Streaming-/Drogerie-Buchungen automatisch über die Händler-Datenbank", async () => {
    const db = await getDb();
    const merchantCovered = await db.select<{ total: number; categorized: number }[]>(
      `select count(*) as total, sum(case when category_id is not null then 1 else 0 end) as categorized
       from transactions
       where is_deleted = 0
         and (counterparty like '%REWE%' or counterparty like '%EDEKA%' or counterparty like '%ALDI%'
              or counterparty like '%Lidl%' or counterparty like '%dm-drogerie%' or counterparty like '%Rossmann%'
              or counterparty like '%Netflix%' or counterparty like '%Spotify%' or counterparty like '%Telekom%'
              or counterparty like '%Shell%' or counterparty like '%Aral%')`,
    );
    const { total, categorized } = merchantCovered[0];
    expect(total).toBeGreaterThan(50);
    // Nicht 100% Anspruch (Fuzzy-Matching kann in Einzelfällen daneben liegen), aber deutlich
    // überwiegend automatisch zugeordnet - das ist der eigentliche Beweis, dass die Händler-DB greift.
    expect(categorized / total).toBeGreaterThan(0.9);
  });

  it("lässt Restaurant-/PayPal-Buchungen bewusst unkategorisiert (Aufräumen-Modus bleibt sinnvoll)", async () => {
    const db = await getDb();
    const rows = await db.select<{ category_id: number | null }[]>(
      `select category_id from transactions where is_deleted = 0 and (counterparty like '%Café%' or counterparty like '%PayPal%')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.category_id === null)).toBe(true);
  });

  it("erkennt den monatlichen Sparauftrag als Transfer", async () => {
    const db = await getDb();
    const transfers = await db.select<{ count: number }[]>(
      "select count(*) as count from transactions where is_deleted = 0 and is_transfer = 1",
    );
    expect(transfers[0].count).toBeGreaterThan(0);
  });

  it("legt ein Wertpapierdepot mit Positionen und Kurshistorie an", async () => {
    const db = await getDb();
    const positions = await db.select<{ count: number }[]>("select count(*) as count from depot_positions");
    const prices = await db.select<{ count: number }[]>("select count(*) as count from depot_prices");
    expect(positions[0].count).toBe(3);
    expect(prices[0].count).toBeGreaterThanOrEqual(3 * 7); // 3 Positionen x 7 Kurspunkte je Position
  });

  it("legt ein Budget und eine Sammlung an", async () => {
    const db = await getDb();
    const budgets = await db.select<{ count: number }[]>("select count(*) as count from budgets where is_deleted = 0");
    const collections = await db.select<{ count: number }[]>("select count(*) as count from collections where is_deleted = 0");
    expect(budgets[0].count).toBeGreaterThan(0);
    expect(collections[0].count).toBeGreaterThan(0);
  });
});
