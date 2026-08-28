import { getDb } from "@/db/client";
import type { NotificationItem, NotificationPriority, NotificationType } from "@/db/types";

export async function listNotifications(limit = 50): Promise<NotificationItem[]> {
  const db = await getDb();
  return db.select<NotificationItem[]>(
    "select * from notifications where is_archived = 0 order by created_at desc limit $1",
    [limit],
  );
}

export async function getUnreadNotificationCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "select count(*) as count from notifications where is_archived = 0 and is_read = 0",
  );
  return rows[0]?.count ?? 0;
}

export async function markNotificationRead(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update notifications set is_read = 1 where id = $1", [id]);
}

export async function markAllNotificationsRead(): Promise<void> {
  const db = await getDb();
  await db.execute("update notifications set is_read = 1 where is_archived = 0");
}

export async function archiveNotification(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("update notifications set is_archived = 1 where id = $1", [id]);
}

export async function createOrUpdateNotification(input: {
  type: NotificationType;
  ref_table?: string | null;
  ref_id?: number | null;
  message: string;
  priority?: NotificationPriority;
}): Promise<void> {
  const db = await getDb();
  const priority = input.priority ?? "info";
  const refTable = input.ref_table ?? null;
  const refId = input.ref_id ?? null;

  // Use conflict resolution or manual upsert for partial index
  const existing = await db.select<{ id: number }[]>(
    `select id from notifications 
     where type = $1 
       and coalesce(ref_table, '') = coalesce($2, '') 
       and coalesce(ref_id, 0) = coalesce($3, 0) 
       and is_archived = 0`,
    [input.type, refTable ?? "", refId ?? 0],
  );

  if (existing.length > 0) {
    await db.execute(
      "update notifications set message = $1, priority = $2, created_at = datetime('now') where id = $3",
      [input.message, priority, existing[0].id],
    );
  } else {
    await db.execute(
      `insert into notifications (type, ref_table, ref_id, message, priority) 
       values ($1, $2, $3, $4, $5)`,
      [input.type, refTable, refId, input.message, priority],
    );
    await triggerOsNotification(input.type, input.message, priority);
  }
}

async function triggerOsNotification(type: NotificationType, message: string, priority: NotificationPriority) {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
    const { getSetting } = await import("@/db/repositories/settings");
    
    // Check global level
    const level = await getSetting("notification_level");
    if (level === "none") return;
    if (level === "critical" && priority !== "critical") return;
    if (level === "warning" && priority === "info") return;

    // Check specific toggles
    if (type === "transfer_detected") {
      const wantTransfer = await getSetting("notify_transfer_detected");
      if (wantTransfer === "0") return;
    }
    if (type === "contract_detected") {
      const wantContract = await getSetting("notify_contract_detected");
      if (wantContract === "0") return;
    }

    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    if (permissionGranted) {
      sendNotification({ title: "Klarwert Hinweis", body: message });
    }
  } catch (e) {
    console.warn("Failed to send OS notification", e);
  }
}

function notificationKey(type: NotificationType, refTable: string | null, refId: number | null): string {
  return `${type}:${refTable ?? ""}:${refId ?? ""}`;
}

/** Legt eine Benachrichtigung nur an, wenn noch keine (nicht archivierte) für denselben Typ+Bezug existiert. */
async function notifyOnceIfNew(input: {
  type: NotificationType;
  ref_table?: string | null;
  ref_id?: number | null;
  message: string;
  priority?: NotificationPriority;
}): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>(
    `select id from notifications
     where type = $1
       and coalesce(ref_table, '') = coalesce($2, '')
       and coalesce(ref_id, 0) = coalesce($3, 0)
       and is_archived = 0`,
    [input.type, input.ref_table ?? "", input.ref_id ?? 0],
  );
  if (existing.length > 0) return;
  await createOrUpdateNotification(input);
}

/** Archiviert automatisch alle nicht mehr gültigen Benachrichtigungen der übergebenen Typen (behobene Ursache). */
async function autoArchiveResolved(types: NotificationType[], stillValidKeys: Set<string>): Promise<void> {
  const db = await getDb();
  const placeholders = types.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<{ id: number; type: NotificationType; ref_table: string | null; ref_id: number | null }[]>(
    `select id, type, ref_table, ref_id from notifications where is_archived = 0 and type in (${placeholders})`,
    types,
  );
  for (const row of rows) {
    if (!stillValidKeys.has(notificationKey(row.type, row.ref_table, row.ref_id))) {
      await db.execute("update notifications set is_archived = 1 where id = $1", [row.id]);
    }
  }
}

export async function checkSystemNotifications(): Promise<void> {
  const db = await getDb();
  const stillValid = new Set<string>();
  const markValid = (type: NotificationType, refTable: string | null, refId: number | null) =>
    stillValid.add(notificationKey(type, refTable, refId));

  // 1. Import Reminders
  const settings = await db.select<{ key: string; value: string }[]>("select key, value from settings");
  const reminderDaysSetting = settings.find((s) => s.key === "import_reminder_days")?.value;
  const reminderDays = parseInt(reminderDaysSetting ?? "30", 10);

  if (reminderDays > 0) {
    const assets = await db.select<{ id: number; name: string; last_import_at: string | null }[]>(
      "select id, name, last_import_at from assets where kind = 'account' and is_archived = 0 and is_deleted = 0",
    );

    const now = new Date();
    for (const asset of assets) {
      if (!asset.last_import_at) continue;
      const lastImport = new Date(asset.last_import_at);
      const diffDays = Math.floor((now.getTime() - lastImport.getTime()) / (1000 * 3600 * 24));

      if (diffDays >= reminderDays) {
        await createOrUpdateNotification({
          type: "import_reminder",
          ref_table: "assets",
          ref_id: asset.id,
          message: `Konto ${asset.name}: Letzter Import liegt ${diffDays} Tage zurück.`,
          priority: "warning",
        });
        markValid("import_reminder", "assets", asset.id);
      }
    }
  }

  // 2. Budget Notifications (80% & Exceeded)
  // Check active budget periods
  const currentMonth = new Date().toISOString().substring(0, 7);
  const budgets = await db.select<{
    id: number;
    category_id: number;
    limit_cents: number;
    category_name: string;
  }[]>(
    `select b.id, b.category_id, b.limit_cents, c.name as category_name
     from budgets b
     join categories c on c.id = b.category_id
     where b.is_deleted = 0 and c.is_deleted = 0`,
  );

  for (const b of budgets) {
    // Sum expense transactions in category for this month
    const childCategories = await db.select<{ id: number }[]>(
      "select id from categories where parent_id = $1 and is_deleted = 0",
      [b.category_id],
    );
    const catIds = [b.category_id, ...childCategories.map((c) => c.id)];
    const placeholders = catIds.map((_, idx) => `$${idx + 2}`).join(", ");

    const txRows = await db.select<{ sum_cents: number | null }[]>(
      `select sum(amount_cents) as sum_cents from transactions 
       where is_deleted = 0 
         and exclude_from_stats = 0 
         and amount_cents < 0 
         and substr(booking_date, 1, 7) = $1
         and category_id in (${placeholders})`,
      [currentMonth, ...catIds],
    );

    const spentCents = Math.abs(txRows[0]?.sum_cents ?? 0);
    const ratio = b.limit_cents > 0 ? spentCents / b.limit_cents : 0;

    if (ratio >= 1.0) {
      await createOrUpdateNotification({
        type: "budget_exceeded",
        ref_table: "budgets",
        ref_id: b.id,
        message: `Budget überschritten: ${b.category_name} (${(ratio * 100).toFixed(0)}%)`,
        priority: "critical",
      });
      markValid("budget_exceeded", "budgets", b.id);
    } else if (ratio >= 0.8) {
      await createOrUpdateNotification({
        type: "budget_80",
        ref_table: "budgets",
        ref_id: b.id,
        message: `Budget zu 80% erreicht: ${b.category_name} (${(ratio * 100).toFixed(0)}%)`,
        priority: "warning",
      });
      markValid("budget_80", "budgets", b.id);
    }
  }

  // 3. Saldo-Abweichung (berechneter Saldo vs. zuletzt bestätigter Bankstand)
  const accounts = await db.select<{ id: number; name: string; last_confirmed_balance_cents: number | null }[]>(
    "select id, name, last_confirmed_balance_cents from assets where kind = 'account' and is_deleted = 0 and is_archived = 0",
  );
  for (const acc of accounts) {
    if (acc.last_confirmed_balance_cents === null) continue;
    const anchorRows = await db.select<{ valued_at: string; value_cents: number }[]>(
      "select valued_at, value_cents from value_history where asset_id = $1 and source = 'anchor' order by valued_at asc limit 1",
      [acc.id],
    );
    const anchor = anchorRows[0];
    if (!anchor) continue;
    const sumRows = await db.select<{ sum_cents: number | null }[]>(
      "select sum(amount_cents) as sum_cents from transactions where is_deleted = 0 and asset_id = $1 and booking_date >= $2",
      [acc.id, anchor.valued_at],
    );
    const calculated = anchor.value_cents + (sumRows[0]?.sum_cents ?? 0);
    const diff = calculated - acc.last_confirmed_balance_cents;
    if (Math.abs(diff) >= 1) {
      await createOrUpdateNotification({
        type: "balance_mismatch",
        ref_table: "assets",
        ref_id: acc.id,
        message: `Saldo-Abweichung bei ${acc.name}: berechnet ${(calculated / 100).toFixed(2)} € vs. zuletzt bestätigt ${(acc.last_confirmed_balance_cents / 100).toFixed(2)} €.`,
        priority: "warning",
      });
      markValid("balance_mismatch", "assets", acc.id);
    }
  }

  // 4. Fehlgeschlagene Importe (einmalige Ereignisse, kein Auto-Archiv)
  const failedImports = await db.select<{ id: number; filename: string; error_message: string | null; asset_name: string }[]>(
    `select i.id, i.filename, i.error_message, a.name as asset_name
     from imports i
     join assets a on a.id = i.asset_id
     where i.status = 'failed'
     order by i.created_at desc limit 20`,
  );
  for (const imp of failedImports) {
    await notifyOnceIfNew({
      type: "import_failed",
      ref_table: "imports",
      ref_id: imp.id,
      message: `Import fehlgeschlagen (${imp.asset_name}, ${imp.filename}): ${imp.error_message ?? "unbekannter Fehler"}`,
      priority: "critical",
    });
  }

  // 5. Verträge: neu erkannt / Preisänderung / beendet
  const contracts = await db.select<{
    id: number;
    name: string;
    status: string;
    current_amount_cents: number;
    previous_amount_cents: number | null;
    is_dismissed: number;
  }[]>(
    "select id, name, status, current_amount_cents, previous_amount_cents, is_dismissed from contracts where is_deleted = 0",
  );
  for (const c of contracts) {
    if (c.is_dismissed) continue;
    if (c.status === "detected") {
      await createOrUpdateNotification({
        type: "contract_detected",
        ref_table: "contracts",
        ref_id: c.id,
        message: `Neuer Vertrag erkannt: ${c.name}`,
        priority: "info",
      });
      markValid("contract_detected", "contracts", c.id);
    } else if (c.status === "price_changed") {
      const from = c.previous_amount_cents !== null ? `${(c.previous_amount_cents / 100).toFixed(2)} €` : "?";
      const to = `${(c.current_amount_cents / 100).toFixed(2)} €`;
      await createOrUpdateNotification({
        type: "price_change",
        ref_table: "contracts",
        ref_id: c.id,
        message: `Preisänderung bei ${c.name}: ${from} → ${to}`,
        priority: "warning",
      });
      markValid("price_change", "contracts", c.id);
    } else if (c.status === "ended") {
      await notifyOnceIfNew({
        type: "contract_ended",
        ref_table: "contracts",
        ref_id: c.id,
        message: `Vertrag beendet: ${c.name}`,
        priority: "info",
      });
    }
  }

  // 6. Unbestätigte Transfer-Erkennungen
  const suggestedTransfers = await db.select<{ id: number; counterparty: string; amount_cents: number }[]>(
    "select id, counterparty, amount_cents from transactions where is_deleted = 0 and is_transfer = 1 and transfer_status = 'suggested'",
  );
  for (const t of suggestedTransfers) {
    await createOrUpdateNotification({
      type: "transfer_detected",
      ref_table: "transactions",
      ref_id: t.id,
      message: `Transfer erkannt, unbestätigt: ${t.counterparty} (${(Math.abs(t.amount_cents) / 100).toFixed(2)} €)`,
      priority: "info",
    });
    markValid("transfer_detected", "transactions", t.id);
  }

  // 7. Sparzweck-Ziel erreicht
  const sparzwecke = await db.select<{ id: number; name: string; target_cents: number | null }[]>(
    "select id, name, target_cents from sparzwecke where is_deleted = 0 and target_cents is not null",
  );
  for (const s of sparzwecke) {
    if (!s.target_cents) continue;
    const sumRows = await db.select<{ total: number | null }[]>(
      "select sum(-amount_cents) as total from transactions where sparzweck_id = $1 and is_saving = 1 and is_deleted = 0 and exclude_from_stats = 0",
      [s.id],
    );
    const cumulative = sumRows[0]?.total ?? 0;
    if (cumulative >= s.target_cents) {
      await createOrUpdateNotification({
        type: "sparzweck_reached",
        ref_table: "sparzwecke",
        ref_id: s.id,
        message: `Sparzweck erreicht: ${s.name} (${(cumulative / 100).toFixed(2)} € von ${(s.target_cents / 100).toFixed(2)} €)`,
        priority: "info",
      });
      markValid("sparzweck_reached", "sparzwecke", s.id);
    }
  }

  // Auto-Archiv: Benachrichtigungen, deren Ursache seit dem letzten Lauf behoben wurde
  await autoArchiveResolved(
    [
      "import_reminder",
      "budget_80",
      "budget_exceeded",
      "balance_mismatch",
      "contract_detected",
      "price_change",
      "transfer_detected",
      "sparzweck_reached",
    ],
    stillValid,
  );
}
