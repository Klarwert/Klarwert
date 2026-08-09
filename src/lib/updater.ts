/**
 * Auto-Update-Prüfung (prompt-auto-update.md). Update-Prüfung ist ein optionaler Zusatzdienst,
 * kein Kernfeature – jeder Fehler (kein Internet, GitHub nicht erreichbar) wird bewusst still und
 * unauffällig behandelt, nie als App-Fehler dargestellt.
 */
export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  notes?: string;
  errorMessage?: string;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return { available: false };
    return { available: true, version: update.version, notes: update.body };
  } catch (e) {
    return { available: false, errorMessage: String(e) };
  }
}

export async function downloadAndInstallUpdate(onProgress?: (downloaded: number, total: number | null) => void): Promise<void> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  const update = await check();
  if (!update) throw new Error("Kein Update verfügbar");

  let downloaded = 0;
  let total: number | null = null;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.(downloaded, total);
    }
  });
  await relaunch();
}
