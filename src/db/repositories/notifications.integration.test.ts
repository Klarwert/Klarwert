import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { getDb, __setTestDatabase } from "@/db/client";
import { createSqliteTestDatabase } from "@/test/sqliteTestDb";
import { runMigrations } from "@/db/migrate";
import { checkSystemNotifications, listNotifications } from "@/db/repositories/notifications";
import i18n from "@/i18n";

/**
 * Regressionstest für die Sprach-/Währungs-Anbindung der System-Benachrichtigungen: die Nachrichten
 * wurden früher als fertiger deutscher Text mit hartem "€" erzeugt und genauso in der DB
 * gespeichert - unabhängig von Sprach-/Währungs-Einstellung. checkSystemNotifications()
 * aktualisiert eine bestehende Benachrichtigung bei jedem Lauf (siehe createOrUpdateNotification),
 * daher reicht es, die Nachricht über i18n zu erzeugen: ein erneuter Lauf nach Sprachwechsel
 * schreibt automatisch den übersetzten Text.
 */
beforeAll(async () => {
  __setTestDatabase(createSqliteTestDatabase());
  await runMigrations();
});

beforeEach(async () => {
  await i18n.changeLanguage("de");
});

describe("checkSystemNotifications", () => {
  it("erzeugt die Import-Erinnerung sprachabhängig", async () => {
    const db = await getDb();
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 45);
    const res = await db.execute(
      "insert into assets (name, kind, account_type, last_import_at) values ($1, 'account', 'giro', $2)",
      ["Girokonto Test", staleDate.toISOString()],
    );
    const assetId = res.lastInsertId as number;

    await checkSystemNotifications();
    const deNotifications = await listNotifications();
    const deNotification = deNotifications.find((n) => n.type === "import_reminder" && n.ref_id === assetId);
    expect(deNotification?.message).toContain("Letzter Import liegt");
    expect(deNotification?.message).toContain("45 Tage");

    await i18n.changeLanguage("en");
    await checkSystemNotifications();
    const enNotifications = await listNotifications();
    const enNotification = enNotifications.find((n) => n.type === "import_reminder" && n.ref_id === assetId);
    expect(enNotification?.message).toContain("last import was");
    expect(enNotification?.message).toContain("45 days");
  });
});
