import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Person } from "@/db/types";
import {
  Download,
  FolderOpen,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { appDataDir, documentDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomFieldsManager } from "@/features/profil/components/CustomFieldsManager";
import { BankTemplateManager } from "@/features/profil/components/BankTemplateManager";
import { UpdateChecker } from "@/features/profil/components/UpdateChecker";
import { CommunityUpdateChecker } from "@/features/profil/components/CommunityUpdateChecker";
import { QuoteSettings } from "@/features/profil/components/QuoteSettings";
import { DynamicSettings } from "@/features/profil/components/DynamicSettings";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { InfoTooltip } from "@/components/InfoTooltip";
import { usePersons } from "@/hooks/usePersons";
import { useAssets } from "@/hooks/useAssets";
import { updateAsset } from "@/db/repositories/assets";
import { createPerson, deletePerson, updatePerson } from "@/db/repositories/persons";
import { listPersonAliases, addPersonAlias, removePersonAlias } from "@/db/repositories/personAliases";
import { deleteAllData, exportBackupJson, importBackupJson, exportCsvBackup } from "@/db/repositories/backup";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

const BUNDESLAENDER = [
  { value: "BW", label: "Baden-Württemberg (8 %)" },
  { value: "BY", label: "Bayern (8 %)" },
  { value: "BE", label: "Berlin (9 %)" },
  { value: "BB", label: "Brandenburg (9 %)" },
  { value: "HB", label: "Bremen (9 %)" },
  { value: "HH", label: "Hamburg (9 %)" },
  { value: "HE", label: "Hessen (9 %)" },
  { value: "MV", label: "Mecklenburg-Vorpommern (9 %)" },
  { value: "NI", label: "Niedersachsen (9 %)" },
  { value: "NW", label: "Nordrhein-Westfalen (9 %)" },
  { value: "RP", label: "Rheinland-Pfalz (9 %)" },
  { value: "SL", label: "Saarland (9 %)" },
  { value: "SN", label: "Sachsen (9 %)" },
  { value: "ST", label: "Sachsen-Anhalt (9 %)" },
  { value: "SH", label: "Schleswig-Holstein (9 %)" },
  { value: "TH", label: "Thüringen (9 %)" },
];

interface PersonRowProps {
  person: Person;
  onUpdate: (
    id: number,
    fields: {
      name?: string;
      role?: "adult" | "child";
      birth_year?: number | null;
      kirchensteuer_aktiv?: 0 | 1;
      bundesland?: string | null;
    },
  ) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}

function PersonRow({ person: p, onUpdate, onRemove }: PersonRowProps) {
  const { t } = useTranslation("profil");
  const queryClient = useQueryClient();
  const [birthYearStr, setBirthYearStr] = useState(p.birth_year ? String(p.birth_year) : "");
  const [newAlias, setNewAlias] = useState("");
  const { data: aliases } = useQuery({
    queryKey: ["person-aliases", p.id],
    queryFn: () => listPersonAliases(p.id),
  });

  function invalidateAliases() {
    void queryClient.invalidateQueries({ queryKey: ["person-aliases", p.id] });
  }

  async function handleAddAlias() {
    if (!newAlias.trim()) return;
    await addPersonAlias(p.id, newAlias.trim());
    setNewAlias("");
    invalidateAliases();
  }

  useEffect(() => {
    setBirthYearStr(p.birth_year ? String(p.birth_year) : "");
  }, [p.birth_year]);

  const handleBirthYearBlur = () => {
    const trimmed = birthYearStr.trim();
    if (!trimmed) {
      if (p.birth_year !== null) {
        void onUpdate(p.id, { birth_year: null });
      }
      return;
    }

    const currentYear = new Date().getFullYear();
    if (trimmed.length === 4) {
      const year = parseInt(trimmed, 10);
      if (!isNaN(year) && year >= 1900 && year <= currentYear) {
        if (p.birth_year !== year) {
          void onUpdate(p.id, { birth_year: year });
        }
        return;
      }
    }

    showErrorToast(t("persons.birthYearError", { year: currentYear }));
    setBirthYearStr(p.birth_year ? String(p.birth_year) : "");
  };

  return (
    <div className="space-y-3 rounded-klein bg-paper p-4 border border-border/60">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={p.name}
          className="w-[160px]"
          placeholder="Name"
          onChange={(e) => void onUpdate(p.id, { name: e.target.value })}
        />
        <Select
          value={p.role}
          onValueChange={(val: "adult" | "child") => void onUpdate(p.id, { role: val })}
        >
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="adult">{t("persons.role.adult")}</SelectItem>
            <SelectItem value="child">{t("persons.role.child")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            placeholder={t("persons.birthYear")}
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={birthYearStr}
            className="w-[130px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 4);
              setBirthYearStr(val);
            }}
            onBlur={handleBirthYearBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
          <InfoTooltip label="Wird ausschließlich für die Restlaufzeit-Berechnung im FIRE-/Entnahme-Rechner verwendet." />
        </div>
        <Button variant="ghost" size="icon" onClick={() => void onRemove(p.id)}>
          <Trash2 className="size-4 text-brick" />
        </Button>
      </div>

      {/* Kirchensteuer pro Person */}
      <div className="flex flex-wrap items-center gap-4 pt-2 text-xs border-t border-border/40">
        <div className="flex items-center gap-2">
          <Switch
            id={`ks-${p.id}`}
            checked={p.kirchensteuer_aktiv === 1}
            onCheckedChange={(checked) =>
              void onUpdate(p.id, { kirchensteuer_aktiv: checked ? 1 : 0 })
            }
          />
          <Label htmlFor={`ks-${p.id}`} className="text-xs cursor-pointer text-charcoal">
            {t("persons.kirchensteuer")}
          </Label>
          {/* WIP: wird gespeichert, aber noch nicht in den Steuer-/Entnahmeplan-Berechnungen berücksichtigt */}
          <span className="text-[10px] text-gold border border-gold/30 rounded-pill px-1.5 py-0.5 leading-none">
            kommt bald
          </span>
        </div>

        {p.kirchensteuer_aktiv === 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate">{t("persons.bundesland")}</Label>
            <Select
              value={p.bundesland ?? ""}
              onValueChange={(val) => void onUpdate(p.id, { bundesland: val })}
            >
              <SelectTrigger className="w-[210px] h-8 text-xs"><SelectValue placeholder={t("persons.bundeslandPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {BUNDESLAENDER.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Namensvarianten für die Transfer-Erkennung (Stufe 3, Namensabgleich) */}
      <div className="space-y-1.5 pt-2 border-t border-border/40">
        <Label className="text-xs text-slate">{t("persons.aliases")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          {aliases?.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-xs text-slate"
            >
              {a.alias}
              <button
                type="button"
                aria-label={t("persons.aliasRemove", { alias: a.alias })}
                onClick={() => {
                  void (async () => {
                    await removePersonAlias(a.id);
                    invalidateAliases();
                  })();
                }}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <Input
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddAlias();
              }
            }}
            placeholder={t("persons.aliasPlaceholder")}
            className="h-7 w-40 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

export function ProfilPage() {
  const { t } = useTranslation(["profil", "app"]);
  const queryClient = useQueryClient();
  const { data: persons } = usePersons();
  const [showHiddenAccounts, setShowHiddenAccounts] = useState(false);
  const { data: assets } = useAssets(showHiddenAccounts);
  const accountAssets = assets?.filter((a) => a.kind === "account") ?? [];

  const [activeTab, setActiveTab] = useState<"allgemein" | "personen" | "import" | "system">("allgemein");

  const [ownerPending, setOwnerPending] = useState<Record<number, Set<number>>>({});
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonAlias, setNewPersonAlias] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInputText, setDeleteInputText] = useState("");
  const [dbPath, setDbPath] = useState<string>("");
  const [dbDir, setDbDir] = useState<string>("");
  const [backupDir, setBackupDir] = useState<string>("");

  useEffect(() => {
    async function fetchPaths() {
      try {
        const appData = await appDataDir();
        setDbDir(appData);
        setDbPath(await join(appData, "klarwert.db"));
        const docDir = await documentDir();
        setBackupDir(await join(docDir, "Klarwert", "Backups"));
      } catch (e) {
        console.error("Failed to fetch paths", e);
      }
    }
    void fetchPaths();
  }, []);

  function isChecked(assetId: number, personId: number): boolean {
    if (ownerPending[assetId] !== undefined) {
      return ownerPending[assetId].has(personId);
    }
    return assets?.find((a) => a.id === assetId)?.owner_ids.includes(personId) ?? false;
  }

  async function handleToggleOwner(assetId: number, personId: number) {
    const asset = assets?.find((a) => a.id === assetId);
    const current = new Set(ownerPending[assetId] ?? asset?.owner_ids ?? []);
    if (current.has(personId)) {
      if (current.size === 1) {
        showErrorToast(t("persons.minOwnerError"));
        return;
      }
      current.delete(personId);
    } else {
      current.add(personId);
    }
    setOwnerPending((prev) => ({ ...prev, [assetId]: current }));
    await updateAsset(assetId, { owner_ids: [...current] });
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
  }

  async function handleAddPerson() {
    if (!newPersonName.trim() || !newPersonAlias.trim()) return;
    try {
      const personId = await createPerson({ name: newPersonName.trim(), role: "adult" });
      // Alias ist Pflichtfeld (nicht nur der Name selbst): erst darüber weiß die Transfer-/
      // Sparkonto-Erkennung, wie diese Person in echten Bank-Buchungstexten tatsächlich auftaucht
      // (z. B. "M. Mustermann" statt "Max Mustermann") – ohne mindestens eine Namensvariante bleibt
      // die Erkennung wirkungslos, siehe Bugfix-Runde 3, Punkt 4.
      await addPersonAlias(personId, newPersonAlias.trim());
      setNewPersonName("");
      setNewPersonAlias("");
      void queryClient.invalidateQueries({ queryKey: ["persons"] });
      void queryClient.invalidateQueries({ queryKey: ["person-aliases", personId] });
      toast.success(t("persons.added"));
    } catch (e) {
      showErrorToast(t("persons.addError", { error: String(e) }));
    }
  }

  async function handlePersonUpdate(
    id: number,
    fields: {
      name?: string;
      role?: "adult" | "child";
      birth_year?: number | null;
      kirchensteuer_aktiv?: 0 | 1;
      bundesland?: string | null;
    },
  ) {
    await updatePerson(id, fields);
    void queryClient.invalidateQueries({ queryKey: ["persons"] });
  }

  async function handleRemovePerson(id: number) {
    if ((persons ?? []).length <= 1) {
      showErrorToast(t("persons.lastPersonError"));
      return;
    }
    await deletePerson(id);
    void queryClient.invalidateQueries({ queryKey: ["persons"] });
    toast.success(t("persons.remove"));
  }

  async function handleExportBackup() {
    try {
      const json = await exportBackupJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `klarwert-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("data.exportSuccess"));
    } catch (e) {
      showErrorToast(t("danger.error", { error: String(e) }));
    }
  }

  async function handleExportCsv() {
    try {
      await exportCsvBackup();
      toast.success(t("data.exportCsvSuccess"));
    } catch (e) {
      showErrorToast(t("danger.error", { error: String(e) }));
    }
  }

  function handleImportBackupFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        await importBackupJson(text);
        void queryClient.invalidateQueries();
        toast.success(t("data.importSuccess"));
      } catch (err) {
        showErrorToast(t("danger.error", { error: String(err) }));
      }
    };
    reader.readAsText(file);
  }

  async function handleWipeData() {
    if (deleteInputText.trim().toLowerCase() !== t("danger.confirmInput").toLowerCase()) return;
    try {
      await deleteAllData();
      void queryClient.invalidateQueries();
      toast.success(t("danger.success"));
      window.location.reload();
    } catch (e) {
      showErrorToast(t("danger.error", { error: String(e) }));
    } finally {
      setDeleteConfirmOpen(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div>
        <h1 className="font-heading text-xl text-charcoal">{t("title")}</h1>
        <p className="text-sm text-slate">{t("subtitle")}</p>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl mb-8">
          <TabsTrigger value="allgemein">{t("tabs.general")}</TabsTrigger>
          <TabsTrigger value="personen">{t("tabs.persons")}</TabsTrigger>
          <TabsTrigger value="import">{t("tabs.import")}</TabsTrigger>
          <TabsTrigger value="system">{t("tabs.system")}</TabsTrigger>
        </TabsList>

        <TabsContent value="allgemein" className="space-y-6">
          <DynamicSettings />

          {/* 5. BENUTZERDEFINIERTE FELDER */}
          <div className="space-y-6 rounded-card border border-border bg-card p-6">
            <h2 className="font-heading text-lg text-charcoal">{t("customFields")}</h2>
            <CustomFieldsManager />
          </div>
        </TabsContent>

        <TabsContent value="personen" className="space-y-6">
          {/* 1. PERSONEN & ZUORDNUNG */}
          <div className="space-y-6 rounded-card border border-border bg-card p-6">
            <h2 className="font-heading text-lg text-charcoal">{t("persons.title")}</h2>
            <div className="space-y-4">
              {(persons ?? []).map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  onUpdate={handlePersonUpdate}
                  onRemove={handleRemovePerson}
                />
              ))}

              <div className="flex flex-wrap items-start gap-2 pt-2">
                <div className="space-y-1">
                  <Input
                    placeholder={t("persons.namePlaceholder")}
                    value={newPersonName}
                    onChange={(e) => setNewPersonName(e.target.value)}
                    className="max-w-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Input
                    placeholder={t("persons.aliasMandatoryPlaceholder")}
                    value={newPersonAlias}
                    onChange={(e) => setNewPersonAlias(e.target.value)}
                    className="max-w-xs"
                  />
                  <p className="text-xs text-slate">{t("persons.aliasHint")}</p>
                </div>
                <Button onClick={() => void handleAddPerson()} disabled={!newPersonName.trim() || !newPersonAlias.trim()}>
                  <Plus className="size-4" /> {t("persons.addBtn")}
                </Button>
              </div>
            </div>

            {persons && persons.length > 0 && accountAssets.length > 0 && (
              <div className="pt-4 border-t border-border space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-charcoal">{t("persons.ownerMatrix")}</h3>
                  <label className="flex items-center gap-2 text-xs text-slate">
                    <Switch checked={showHiddenAccounts} onCheckedChange={setShowHiddenAccounts} />
                    Auch ausgeblendete anzeigen
                  </label>
                </div>
                <div className="overflow-auto rounded-klein border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-accent">
                        <th className="px-3 py-2 text-left font-medium text-charcoal">{t("persons.account")}</th>
                        {persons.map((p) => (
                          <th key={p.id} className="px-3 py-2 text-center font-medium text-charcoal">
                            {p.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {accountAssets.map((asset) => (
                        <tr key={asset.id} className={`border-b border-border last:border-0 ${asset.is_archived === 1 ? "bg-accent/50 opacity-70" : ""}`}>
                          <td className="px-3 py-2 text-charcoal">
                            <div className="flex items-center gap-2">
                              <Input
                                value={asset.name}
                                className="h-7 max-w-[220px] text-sm"
                                onChange={(e) => {
                                  void updateAsset(asset.id, { name: e.target.value }).then(() => {
                                    void queryClient.invalidateQueries({ queryKey: ["assets"] });
                                  });
                                }}
                              />
                              {asset.is_archived === 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    void updateAsset(asset.id, { is_archived: 0 }).then(() => {
                                      void queryClient.invalidateQueries({ queryKey: ["assets"] });
                                    });
                                  }}
                                >
                                  Wiedereinblenden
                                </Button>
                              )}
                            </div>
                          </td>
                          {persons.map((person) => (
                            <td key={person.id} className="px-3 py-2">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={isChecked(asset.id, person.id)}
                                  onCheckedChange={() => void handleToggleOwner(asset.id, person.id)}
                                />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="import" className="space-y-6">
          {/* BANK-VORLAGEN */}
          <div className="space-y-6 rounded-card border border-border bg-card p-6">
            <h2 className="font-heading text-lg text-charcoal">{t("bankTemplates")}</h2>
            <BankTemplateManager />
          </div>

          {/* KURSDATEN */}
          <div className="space-y-4 rounded-card border border-border bg-card p-6">
            <div>
              <h2 className="font-heading text-lg text-charcoal">{t("quotes.title")}</h2>
              <p className="mt-1 text-sm text-slate">
                {t("quotes.description")}
              </p>
            </div>
            <QuoteSettings />
          </div>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          {/* 3. DATEN & BACKUP */}
          <div className="space-y-6 rounded-card border border-border bg-card p-6">
            <h2 className="font-heading text-lg text-charcoal">{t("data.title")}</h2>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("data.dbPath")}</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input value={dbPath} readOnly className="font-mono text-xs text-slate bg-accent" />
                  <Button variant="outline" onClick={() => void openPath(dbDir)} disabled={!dbDir}>
                    <FolderOpen className="size-4" /> {t("data.openFolder")}
                  </Button>
                </div>
                <p className="text-xs text-slate">{t("data.dbPathHint")}</p>
              </div>
              
              <div className="space-y-1.5">
                <Label>{t("data.backupDir")}</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input value={backupDir} readOnly className="font-mono text-xs text-slate bg-accent" />
                  <Button variant="outline" onClick={() => void openPath(backupDir)} disabled={!backupDir}>
                    <FolderOpen className="size-4" /> {t("data.openFolder")}
                  </Button>
                </div>
                <p className="text-xs text-slate">{t("data.backupDirHint")}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => void handleExportBackup()}>
                <Download className="size-4" /> {t("data.exportJson")}
              </Button>
              <Button variant="outline" onClick={() => void handleExportCsv()}>
                <Download className="size-4" /> {t("data.exportCsv")}
              </Button>
              <label className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span><Upload className="size-4" /> {t("data.importJson")}</span>
                </Button>
                <input type="file" accept=".json" className="hidden" onChange={handleImportBackupFile} />
              </label>
            </div>
            <p className="text-xs text-slate">{t("data.hint")}</p>
          </div>

          {/* COMMUNITY-UPDATES */}
          <div className="space-y-4 rounded-card border border-border bg-card p-6">
            <div>
              <h2 className="font-heading text-lg text-charcoal">{t("communityData.title")}</h2>
              <p className="mt-1 text-sm text-slate">
                {t("communityData.description")}
              </p>
            </div>
            <CommunityUpdateChecker />
          </div>

          {/* 4. UPDATES */}
          <div className="space-y-6 rounded-card border border-border bg-card p-6">
            <h2 className="font-heading text-lg text-charcoal">{t("about.title")}</h2>
            <UpdateChecker />
          </div>

          {/* 6. DANGER ZONE */}
          <div className="space-y-6 rounded-card border border-border bg-card p-6">
            <h2 className="font-heading text-lg text-brick">{t("danger.title")}</h2>
            <p className="text-sm text-slate">{t("danger.description")}</p>
            <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
              <Trash2 className="mr-2 size-4" /> {t("danger.button")}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("danger.confirmTitle")}
        description={t("danger.confirmDescription")}
        confirmLabel={t("danger.confirmButton")}
        onConfirm={() => void handleWipeData()}
      >
        <Input
          placeholder={t("danger.confirmInput")}
          value={deleteInputText}
          onChange={(e) => setDeleteInputText(e.target.value)}
          className="mt-3"
        />
      </ConfirmDialog>
    </div>
  );
}
