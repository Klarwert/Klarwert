import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Github, Upload } from "lucide-react";
import {
  applyMerchantDataRelease,
  parseMerchantDataRelease,
  listMerchantAliases,
  MERCHANT_RELEASE_SCHEMA_VERSION,
  type MerchantDataRelease,
} from "@/db/repositories/merchants";
import type { Category, Merchant } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import { useTranslation } from "react-i18next";

interface ShareSuggestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Teilbare Händler: eigene (is_builtin = 0) UND lokal korrigierte, ursprünglich mitgelieferte
   * Händler (is_modified = 1) - eine Korrektur an einem bereits bekannten Händler ist der
   * häufigste Beitrags-Fall und darf nicht ausgeschlossen werden, nur weil is_builtin nach einer
   * Korrektur bewusst 1 bleibt (siehe updateMerchantContent() in merchants.ts).
   */
  ownMerchants: Merchant[];
  categories: Category[];
  onImported?: () => void;
}

/** GitHub-Issue-Template im Community-Repo, siehe klarwert-community-haendler-db.md. */
const COMMUNITY_ISSUE_URL = "https://github.com/Klarwert/Klarwert-Community-Rules/issues/new";

/** B15 "export"-Variante: Zeile-für-Zeile-Vorschau vor dem Teilen von Händler→Kategorie-Vorschlägen. */
export function ShareSuggestionsDialog({ open: isOpen, onOpenChange, ownMerchants, categories, onImported }: ShareSuggestionsDialogProps) {
  const { t } = useTranslation(["kategorien", "app"]);
  const rows = useMemo(
    () =>
      ownMerchants
        .filter((m) => m.default_category_id !== null)
        .map((m) => ({
          merchant: m,
          categoryName: categories.find((c) => c.id === m.default_category_id)?.name ?? "?",
        })),
    [ownMerchants, categories],
  );
  const [selected, setSelected] = useState<Set<number>>(() => new Set(rows.map((r) => r.merchant.id)));
  const [importRelease, setImportRelease] = useState<MerchantDataRelease | null>(null);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) setSelected(new Set(rows.map((r) => r.merchant.id)));
  }, [isOpen, rows]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGithubIssue() {
    const chosen = rows.filter((r) => selected.has(r.merchant.id));
    const lines = chosen.map((r) => `- ${r.merchant.display_name} → ${r.categoryName}`).join("\n");
    const body = `Vorgeschlagene Händler→Kategorie-Zuordnungen:\n\n${lines}\n\n(Erzeugt von Klarwert – enthält ausschließlich Händler→Kategorie-Zuordnungen, keine Beträge/Daten/Kontodaten.)`;
    const url = `${COMMUNITY_ISSUE_URL}?title=${encodeURIComponent("Neue Händler-Vorschläge")}&body=${encodeURIComponent(body)}`;
    await openUrl(url);
    onOpenChange(false);
  }

  /**
   * "Datei herunterladen" – zweite, gleichwertige Option neben dem GitHub-Issue (Konzept Abschnitt 4):
   * dieselbe JSON-Struktur wie applyMerchantDataRelease erwartet, ohne dass ein GitHub-Account
   * vorausgesetzt wird. Wie die Datei danach zum Maintainer gelangt (Discord, Forum, E-Mail),
   * muss die App nicht wissen.
   */
  async function handleDownload() {
    const chosen = rows.filter((r) => selected.has(r.merchant.id));
    const merchants = await Promise.all(
      chosen.map(async (r) => {
        const aliases = await listMerchantAliases(r.merchant.id);
        const category = categories.find((c) => c.id === r.merchant.default_category_id);
        return {
          canonical_name: r.merchant.canonical_name,
          display_name: r.merchant.display_name,
          default_category_template_key: category?.template_key ?? null,
          status: "active" as const,
          // 'iban'/'account_identifier' identifizieren ein konkretes Bankkonto und dürfen eine
          // geteilte Vorschlagsdatei niemals verlassen (siehe parseMerchantDataRelease() - eine
          // solche Datei würde beim Re-Import ohnehin abgelehnt, hier aber schon präventiv gefiltert,
          // damit ein Nutzer ein Kontokennzeichen nicht versehentlich in eine Teilen-Datei schreibt).
          aliases: aliases
            .filter((a) => a.match_type === "name_exact" || a.match_type === "name_fuzzy" || a.match_type === "regex")
            .map((a) => ({ type: a.match_type, value: a.match_value })),
        };
      }),
    );
    const payload = { schema_version: MERCHANT_RELEASE_SCHEMA_VERSION, source_version: new Date().toISOString().slice(0, 10), merchants };
    const path = await save({
      title: "Händler-Vorschläge speichern",
      defaultPath: "klarwert-haendler-vorschlaege.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    await writeTextFile(path, JSON.stringify(payload, null, 2));
    toast.success("Vorschlagsdatei gespeichert");
    onOpenChange(false);
  }

  async function handleImportFile() {
    try {
      const path = await open({
        title: "Händler-Vorschläge importieren",
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return;
      const parsed = parseMerchantDataRelease(JSON.parse(await readTextFile(path)));
      setImportRelease(parsed);
      setImportSelected(new Set(parsed.merchants.map((m) => m.canonical_name)));
    } catch (e) {
      showErrorToast(`Import fehlgeschlagen: ${String(e)}`);
    }
  }

  async function handleApplyImport() {
    if (!importRelease) return;
    try {
      const selectedMerchants = importRelease.merchants.filter((m) => importSelected.has(m.canonical_name));
      await applyMerchantDataRelease({ ...importRelease, merchants: selectedMerchants });
      toast.success(`${selectedMerchants.length} Händler übernommen`);
      setImportRelease(null);
      setImportSelected(new Set());
      onImported?.();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`${t("app:errors.unknownError")}: ${String(e)}`);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("merchants.share.title")}</DialogTitle>
          <DialogDescription>
            {t("merchants.share.desc")}
          </DialogDescription>
        </DialogHeader>
        {importRelease ? (
          <>
            <p className="text-xs text-slate" aria-live="polite">
              {t("merchants.share.selectedOf", { selected: importSelected.size, total: importRelease.merchants.length })}
            </p>
            <div className="max-h-[320px] space-y-1 overflow-y-auto">
              {importRelease.merchants.map((m) => (
                <label key={m.canonical_name} className={`flex items-center gap-2 rounded-md border border-border p-2 text-sm ${importSelected.has(m.canonical_name) ? "" : "opacity-50"}`}>
                  <Checkbox
                    checked={importSelected.has(m.canonical_name)}
                    onCheckedChange={() => {
                      setImportSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.canonical_name)) next.delete(m.canonical_name);
                        else next.add(m.canonical_name);
                        return next;
                      });
                    }}
                  />
                  <span className="text-charcoal">{m.display_name}</span>
                  <span className="text-slate">→</span>
                  <span className="text-slate">{m.default_category_template_key ?? t("merchants.noCategory")}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-slate" aria-live="polite">
              {t("merchants.share.selectedOf", { selected: selected.size, total: rows.length })}
            </p>
            <div className="max-h-[320px] space-y-1 overflow-y-auto">
              {rows.length === 0 && (
                <p className="p-3 text-sm text-slate">{t("merchants.share.noOwn")}</p>
              )}
              {rows.map((r) => (
                <label
                  key={r.merchant.id}
                  className={`flex items-center gap-2 rounded-md border border-border p-2 text-sm ${
                    selected.has(r.merchant.id) ? "" : "opacity-50"
                  }`}
                >
                  <Checkbox checked={selected.has(r.merchant.id)} onCheckedChange={() => toggle(r.merchant.id)} />
                  <span className="text-charcoal">{r.merchant.display_name}</span>
                  <span className="text-slate">→</span>
                  <span className="text-slate">{r.categoryName}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <DialogFooter>
          {importRelease ? (
            <>
              <Button variant="ghost" onClick={() => setImportRelease(null)}>{t("merchants.share.back")}</Button>
              <Button onClick={() => void handleApplyImport()} disabled={importSelected.size === 0}>{t("merchants.share.applySelected")}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("app:common.cancel")}
              </Button>
              <Button variant="outline" onClick={() => void handleImportFile()}>
                <Upload className="mr-1.5 size-4" /> {t("merchants.share.importFile")}
              </Button>
              <Button variant="outline" onClick={() => void handleDownload()} disabled={selected.size === 0}>
                <Download className="mr-1.5 size-4" /> {t("merchants.share.downloadFile")}
              </Button>
              <Button onClick={() => void handleGithubIssue()} disabled={selected.size === 0}>
                <Github className="mr-1.5 size-4" /> {t("merchants.share.githubIssue")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
