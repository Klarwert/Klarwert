/**
 * Demo-Daten-Generator: befüllt die aktuelle (leere) Datenbank mit einer realistischen,
 * mehrmonatigen Transaktionshistorie für einen Musterhaushalt (2 Erwachsene + 1 Kind), damit
 * Klarwert ohne eigene Kontoauszüge ausprobiert werden kann ("Mit Demo-Daten erkunden" im
 * Onboarding, siehe Onboarding.tsx).
 *
 * Wichtige Designentscheidungen:
 * - Alle Daten sind relativ zu `new Date()` verankert (Enddatum = heute, Start = vor
 *   HISTORY_MONTHS Monaten) – die Demo wirkt nie veraltet, egal wann sie erzeugt wird.
 * - Empfängertexte für Supermärkte/Drogerien/Streaming/Tanken/Amazon/Bahn/Telekom sind bewusst so
 *   gewählt, dass sie exakt auf die mitgelieferten Händler-Aliase (seedDefaultMerchants(), siehe
 *   merchants.ts) passen. Kategorien werden dafür NICHT hart codiert, sondern absichtlich mit
 *   category_id = null eingefügt und danach durch den echten runPipelineForTransactions()-Lauf
 *   automatisch zugeordnet – das ist zugleich der beste Praxistest, dass die Händler-Datenbank
 *   tatsächlich funktioniert (siehe Nutzeranfrage).
 * - Miete/Gehalt/Versicherung/Kita bekommen bewusst eine explizite Kategorie: realistisch kann die
 *   Händler-Datenbank einen beliebigen Arbeitgeber- oder Vermieternamen nicht generisch erkennen,
 *   genau wie bei einem echten Nutzer nach dem ersten Import.
 * - Ein Teil der Buchungen (Restaurants, PayPal/Klarna ohne erkennbaren Händler im Zweck) bleibt
 *   absichtlich unkategorisiert – das zeigt den "Aufräumen"-Modus als echten, nötigen Workflow statt
 *   eine Demo zu bauen, in der ohnehin schon alles perfekt ist.
 * - Ein monatlicher Dauerauftrag vom Gemeinschaftskonto aufs Tagesgeld testet die
 *   Transfer-Erkennung; wiederkehrende Buchungen (Miete, Netflix, Kita, ...) testen die
 *   Vertragserkennung (detectRecurringPatterns()).
 */
import { getDb, runInTransaction } from "@/db/client";
import type Database from "@tauri-apps/plugin-sql";
import { createPerson } from "@/db/repositories/persons";
import { createAsset } from "@/db/repositories/assets";
import { createSparzweck } from "@/db/repositories/sparzwecke";
import { createCollection } from "@/db/repositories/collections";
import { createTag } from "@/db/repositories/tags";
import { createBudget } from "@/db/repositories/budgets";
import { getCategoryIdByTemplateKey } from "@/db/repositories/categories";
import { normalizeFingerprint } from "@/db/repositories/transactions";
import { runPipelineForTransactions } from "@/lib/pipeline";
import { detectRecurringPatterns } from "@/lib/contractDetection";

const HISTORY_MONTHS = 6;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Zufälliges Datum innerhalb eines Kalendermonats (relativ zu `anchor`, `monthsAgo` Monate zurück), auf den heutigen Tag begrenzt. */
function randomDayInMonth(anchor: Date, monthsAgo: number, day?: number): Date {
  const d = new Date(anchor.getFullYear(), anchor.getMonth() - monthsAgo, day ?? 1 + Math.floor(Math.random() * 27));
  return d > anchor ? anchor : d;
}

function randomAmountCents(minEuro: number, maxEuro: number): number {
  return -Math.round((minEuro + Math.random() * (maxEuro - minEuro)) * 100);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface DraftTransaction {
  assetId: number;
  bookingDate: Date;
  counterparty: string;
  purpose: string;
  amountCents: number;
  categoryId?: number | null;
  categorizationSource?: "manual" | "none";
  isReviewed?: 0 | 1;
}

async function insertTransaction(db: Database, t: DraftTransaction): Promise<number> {
  const bookingDateIso = isoDate(t.bookingDate);
  const fingerprint = normalizeFingerprint(bookingDateIso, t.amountCents, t.counterparty);
  const externalId = `DEMO-${t.assetId}-${bookingDateIso}-${Math.round(Math.random() * 1e9)}`;
  const res = await db.execute(
    `insert into transactions
      (asset_id, booking_date, value_date, counterparty, purpose, amount_cents, source, external_id, fingerprint, category_id, categorization_source, is_reviewed)
     values ($1, $2, $2, $3, $4, $5, 'import', $6, $7, $8, $9, $10)`,
    [
      t.assetId,
      bookingDateIso,
      t.counterparty,
      t.purpose,
      t.amountCents,
      externalId,
      fingerprint,
      t.categoryId ?? null,
      t.categorizationSource ?? "none",
      t.isReviewed ?? 1,
    ],
  );
  return res.lastInsertId as number;
}

/** Wiederkehrende Positionen mit Händler-DB-Abdeckung: category_id bleibt null, die Pipeline ordnet sie zu. */
const MERCHANT_COVERED_RECURRING: { counterparty: string; purpose: string; minEuro: number; maxEuro: number }[] = [
  { counterparty: "Netflix", purpose: "Netflix Mitgliedschaft", minEuro: 17.99, maxEuro: 17.99 },
  { counterparty: "Spotify", purpose: "Spotify Premium Familie", minEuro: 16.99, maxEuro: 16.99 },
  { counterparty: "Telekom Deutschland", purpose: "Rechnung Festnetz/Internet", minEuro: 44.99, maxEuro: 44.99 },
];

const GROCERY_MERCHANTS = ["REWE Markt", "EDEKA", "ALDI SÜD", "Lidl"];
const DROGERIE_MERCHANTS = ["dm-drogerie markt", "Rossmann"];
const FUEL_MERCHANTS = ["Shell Tankstelle", "Aral Tankstelle"];

export async function seedDemoData(): Promise<void> {
  const today = new Date();

  await runInTransaction(async (db) => {
    // --- Personen ---
    const parent1Id = await createPerson({ name: "Anna Vogel", role: "adult" });
    const parent2Id = await createPerson({ name: "Jonas Vogel", role: "adult" });
    await createPerson({ name: "Lina Vogel", role: "child", birth_year: today.getFullYear() - 8 });

    // --- Konten ---
    const girokontoId = await createAsset({
      name: "Gemeinschaftskonto",
      kind: "account",
      account_type: "giro",
      owner_ids: [parent1Id, parent2Id],
    });
    const tagesgeldId = await createAsset({
      name: "Tagesgeld Rücklage",
      kind: "account",
      account_type: "tagesgeld",
      owner_ids: [parent1Id, parent2Id],
    });
    const kreditkarteId = await createAsset({
      name: "Kreditkarte Jonas",
      kind: "account",
      account_type: "kreditkarte",
      owner_ids: [parent2Id],
    });
    const depotId = await createAsset({
      name: "Wertpapierdepot",
      kind: "account",
      account_type: "depot",
      owner_ids: [parent1Id, parent2Id],
    });

    // Sparzweck + Verknüpfung mit dem Tagesgeldkonto (zeigt Sparzweck-Fortschritt/Vermögen-Widget).
    const notgroschenId = await createSparzweck({ name: "Notgroschen", color: "#2f6b63", target_cents: 1_000_000 });
    await db.execute("update assets set default_sparzweck_id = $1 where id = $2", [notgroschenId, tagesgeldId]);

    // --- Depot-Positionen mit Kurshistorie (testet die neue depotValueAt()-Bewertung end-to-end:
    // Wert = Stückzahl × jüngster Kurs <= heute, siehe networth.ts). Einstandskurs bewusst niedriger
    // als der aktuelle Kurs, um Gewinn/Verlust-Anzeige in DepotPositionList sichtbar zu machen.
    const depotPositions = [
      { isin: "IE00B4L5Y983", name: "iShares Core MSCI World UCITS ETF", shares: "42.5", purchaseCents: 6800, currentCents: 8950 },
      { isin: "IE00B5BMR087", name: "iShares Core S&P 500 UCITS ETF", shares: "18", purchaseCents: 42000, currentCents: 49500 },
      { isin: "DE0007164600", name: "SAP SE", shares: "10", purchaseCents: 11000, currentCents: 10200 },
    ];
    for (const pos of depotPositions) {
      await db.execute(
        `insert into depot_positions (asset_id, isin, name, shares_amount, purchase_price_cents, currency)
         values ($1, $2, $3, $4, $5, 'EUR')`,
        [depotId, pos.isin, pos.name, pos.shares, pos.purchaseCents],
      );
      // Ein Kursverlauf über die letzten Wochen (linear zwischen Einstand und aktuellem Kurs), damit
      // die Depot-Zeitreihe im Vermögen-Chart nicht als Sprung, sondern als Verlauf erscheint.
      const priceSteps = 6;
      for (let i = 0; i <= priceSteps; i += 1) {
        const stepDate = new Date(today);
        stepDate.setDate(stepDate.getDate() - (priceSteps - i) * 14);
        const priceCents = Math.round(pos.purchaseCents + ((pos.currentCents - pos.purchaseCents) * i) / priceSteps);
        await db.execute(
          "insert into depot_prices (isin, date_str, price_cents, currency) values ($1, $2, $3, 'EUR') on conflict(isin, date_str) do update set price_cents = excluded.price_cents",
          [pos.isin, isoDate(stepDate), priceCents],
        );
      }
    }

    // Kategorie-IDs für die Positionen, die die Händler-DB nicht generisch erkennen kann.
    const catMiete = await getCategoryIdByTemplateKey("wohnen.miete_wohngeld");
    const catStrom = await getCategoryIdByTemplateKey("wohnen.strom");
    const catGehalt = await getCategoryIdByTemplateKey("einnahmen.gehalt");
    const catVersicherung = await getCategoryIdByTemplateKey("versicherung.haftpflichtversicherung");
    const catKita = await getCategoryIdByTemplateKey("kinder.kinderbetreuung_gruppen");
    const catTaschengeld = await getCategoryIdByTemplateKey("kinder.taschengeld_unterhalt");
    const catSpielwaren = await getCategoryIdByTemplateKey("kinder.spielwaren");

    const uncategorizedIds: number[] = [];
    const girokontoTxIds: number[] = [];
    const tagesgeldTxIds: number[] = [];

    for (let monthsAgo = HISTORY_MONTHS - 1; monthsAgo >= 0; monthsAgo -= 1) {
      // Gehalt (2x, explizite Kategorie - ein Arbeitgebername ist über eine Händler-DB nicht
      // generisch erkennbar, genau wie bei einem echten Erstimport).
      girokontoTxIds.push(
        await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo, 1),
          counterparty: "Musterfirma GmbH",
          purpose: "Gehalt " + isoDate(randomDayInMonth(today, monthsAgo, 1)).slice(0, 7),
          amountCents: 320000,
          categoryId: catGehalt,
          categorizationSource: catGehalt ? "manual" : "none",
        }),
      );
      girokontoTxIds.push(
        await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo, 1),
          counterparty: "Handwerk & Söhne KG",
          purpose: "Gehalt",
          amountCents: 268000,
          categoryId: catGehalt,
          categorizationSource: catGehalt ? "manual" : "none",
        }),
      );

      // Miete
      girokontoTxIds.push(
        await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo, 3),
          counterparty: "Hausverwaltung Musterstadt GmbH",
          purpose: "Miete inkl. Nebenkosten",
          amountCents: -128000,
          categoryId: catMiete,
          categorizationSource: catMiete ? "manual" : "none",
        }),
      );

      // Strom
      girokontoTxIds.push(
        await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo, 5),
          counterparty: "Stadtwerke Musterstadt",
          purpose: "Abschlag Strom",
          amountCents: -8900,
          categoryId: catStrom,
          categorizationSource: catStrom ? "manual" : "none",
        }),
      );

      // Kita-Beitrag
      girokontoTxIds.push(
        await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo, 2),
          counterparty: "Stadt Musterstadt - Kita-Verwaltung",
          purpose: "Kindergartenbeitrag Lina",
          amountCents: -19000,
          categoryId: catKita,
          categorizationSource: catKita ? "manual" : "none",
        }),
      );

      // Taschengeld
      girokontoTxIds.push(
        await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo, 1),
          counterparty: "Barauszahlung",
          purpose: "Taschengeld Lina",
          amountCents: -1000,
          categoryId: catTaschengeld,
          categorizationSource: catTaschengeld ? "manual" : "none",
        }),
      );

      // Vierteljährliche Versicherung
      if (monthsAgo % 3 === 0) {
        girokontoTxIds.push(
          await insertTransaction(db, {
            assetId: girokontoId,
            bookingDate: randomDayInMonth(today, monthsAgo, 10),
            counterparty: "Musterversicherung AG",
            purpose: "Haftpflichtversicherung Beitrag",
            amountCents: -6500,
            categoryId: catVersicherung,
            categorizationSource: catVersicherung ? "manual" : "none",
          }),
        );
      }

      // Wiederkehrende, über die Händler-DB erkennbare Positionen.
      for (const item of MERCHANT_COVERED_RECURRING) {
        const id = await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo, 27),
          counterparty: item.counterparty,
          purpose: item.purpose,
          amountCents: randomAmountCents(item.minEuro, item.maxEuro),
        });
        girokontoTxIds.push(id);
        uncategorizedIds.push(id);
      }

      // Supermarkt-Einkäufe (8-12x/Monat)
      const groceryTrips = 8 + Math.floor(Math.random() * 5);
      for (let i = 0; i < groceryTrips; i += 1) {
        const id = await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo),
          counterparty: pick(GROCERY_MERCHANTS),
          purpose: "Einkauf",
          amountCents: randomAmountCents(12, 95),
        });
        girokontoTxIds.push(id);
        uncategorizedIds.push(id);
      }

      // Drogerie (2-3x/Monat)
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i += 1) {
        const id = await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo),
          counterparty: pick(DROGERIE_MERCHANTS),
          purpose: "Drogeriebedarf",
          amountCents: randomAmountCents(5, 38),
        });
        girokontoTxIds.push(id);
        uncategorizedIds.push(id);
      }

      // Tanken (2x/Monat)
      for (let i = 0; i < 2; i += 1) {
        const id = await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo),
          counterparty: pick(FUEL_MERCHANTS),
          purpose: "Tanken",
          amountCents: randomAmountCents(45, 95),
        });
        girokontoTxIds.push(id);
        uncategorizedIds.push(id);
      }

      // Amazon-Bestellungen (2-4x/Monat) - über die Kreditkarte, wie im echten Leben üblich.
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i += 1) {
        const id = await insertTransaction(db, {
          assetId: kreditkarteId,
          bookingDate: randomDayInMonth(today, monthsAgo),
          counterparty: "Amazon.de",
          purpose: "Bestellung",
          amountCents: randomAmountCents(9, 140),
        });
        uncategorizedIds.push(id);
      }

      // PayPal / Klarna: bewusst ohne generisch erkennbaren Händler im Zweck - bleibt
      // unkategorisiert, wie bei echten Nutzern, und zeigt den Aufräumen-Modus als nötigen Workflow.
      if (Math.random() > 0.4) {
        const id = await insertTransaction(db, {
          assetId: kreditkarteId,
          bookingDate: randomDayInMonth(today, monthsAgo),
          counterparty: "PayPal Europe S.a.r.l.",
          purpose: "Online-Zahlung",
          amountCents: randomAmountCents(8, 60),
        });
        uncategorizedIds.push(id);
      }

      // Restaurant/Café - von der Händler-DB nicht abgedeckt, bleibt bewusst unkategorisiert.
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i += 1) {
        const id = await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo),
          counterparty: pick(["Café Sonnenschein", "Ristorante Milano", "Burgerhaus Musterstadt"]),
          purpose: "",
          amountCents: randomAmountCents(15, 65),
          isReviewed: 0,
        });
        girokontoTxIds.push(id);
        uncategorizedIds.push(id);
      }

      // Gelegentliche Bahnfahrt (alle 2 Monate)
      if (monthsAgo % 2 === 0) {
        const id = await insertTransaction(db, {
          assetId: girokontoId,
          bookingDate: randomDayInMonth(today, monthsAgo),
          counterparty: "DB Vertrieb GmbH",
          purpose: "Bahnfahrt",
          amountCents: randomAmountCents(35, 110),
        });
        girokontoTxIds.push(id);
        uncategorizedIds.push(id);
      }

      // Gelegentlich Spielzeug fürs Kind
      if (Math.random() > 0.5) {
        girokontoTxIds.push(
          await insertTransaction(db, {
            assetId: girokontoId,
            bookingDate: randomDayInMonth(today, monthsAgo),
            counterparty: "Spielwaren Müller",
            purpose: "Spielzeug",
            amountCents: randomAmountCents(8, 45),
            categoryId: catSpielwaren,
            categorizationSource: catSpielwaren ? "manual" : "none",
          }),
        );
      }

      // Monatlicher Sparauftrag Gemeinschaftskonto -> Tagesgeld (testet Transfer-Erkennung).
      const transferDate = randomDayInMonth(today, monthsAgo, 28);
      const outId = await insertTransaction(db, {
        assetId: girokontoId,
        bookingDate: transferDate,
        counterparty: "Eigenes Tagesgeld Rücklage",
        purpose: "Dauerauftrag Sparen",
        amountCents: -20000,
      });
      const inId = await insertTransaction(db, {
        assetId: tagesgeldId,
        bookingDate: transferDate,
        counterparty: "Eigenes Gemeinschaftskonto",
        purpose: "Dauerauftrag Sparen",
        amountCents: 20000,
      });
      girokontoTxIds.push(outId);
      tagesgeldTxIds.push(inId);
    }

    // --- Budget & Sammlung, um weitere Funktionsbereiche zu zeigen ---
    const catLebensmittel = await getCategoryIdByTemplateKey("lebenshaltung.lebensmittel_getraenke");
    if (catLebensmittel) {
      await createBudget({ category_id: catLebensmittel, limit_cents: 60000, period_type: "month" });
    }
    await createCollection({ name: "Urlaub Ostsee 2026", is_goal: true, target_cents: 150000, status: "active" });
    await createTag("Haushalt", "#7aa662");
    await createTag("Kind", "#c9a44f");

    // --- Kategorisierung & Vertragserkennung über die echte Pipeline laufen lassen ---
    const allIds = [...girokontoTxIds, ...tagesgeldTxIds];
    await runPipelineForTransactions(allIds, db);
    await detectRecurringPatterns(girokontoId, db);
    await detectRecurringPatterns(tagesgeldId, db);
  });

  // Letzten bestätigten Kontostand setzen, damit die Vermögensübersicht sofort einen sinnvollen
  // Wert zeigt, statt auf die erste manuelle Bestätigung durch den Nutzer zu warten.
  const db = await getDb();
  const balances = await db.select<{ id: number; balance: number }[]>(
    `select a.id as id, coalesce(sum(t.amount_cents), 0) as balance
     from assets a left join transactions t on t.asset_id = a.id and t.is_deleted = 0
     where a.name in ('Gemeinschaftskonto', 'Tagesgeld Rücklage', 'Kreditkarte Jonas')
     group by a.id`,
  );
  for (const { id, balance } of balances) {
    await db.execute("update assets set last_confirmed_balance_cents = $1 where id = $2", [balance, id]);
  }
}
