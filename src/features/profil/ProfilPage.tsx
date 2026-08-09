import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Person } from "@/db/types";
import {
  Download,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
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
import { CustomFieldsManager } from "@/features/profil/components/CustomFieldsManager";
import { BankTemplateManager } from "@/features/profil/components/BankTemplateManager";
import { UpdateChecker } from "@/features/profil/components/UpdateChecker";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { usePersons } from "@/hooks/usePersons";
import { useAssets } from "@/hooks/useAssets";
import { useSettingsStore } from "@/stores/settingsStore";
import { updateAsset } from "@/db/repositories/assets";
import { createPerson, deletePerson, updatePerson } from "@/db/repositories/persons";
import { listPersonAliases, addPersonAlias, removePersonAlias } from "@/db/repositories/personAliases";
import { deleteAllData, exportBackupJson, importBackupJson } from "@/db/repositories/backup";
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
  const queryClient = useQueryClient();
  const [birthYearStr, setBirthYearStr] = useState(p.birth_year ? String(p.birth_year) : "");
  const [newAlias, setNewAlias] = useState("");
  const { data: aliases } = useQuery({
    queryKey: ["person-aliases", p.id],
    queryFn: () => listPersonAliases(p.id),
  });

  function invalidateAliases() {
    queryClient.invalidateQueries({ queryKey: ["person-aliases", p.id] });
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

    showErrorToast(`Geburtsjahr muss zwischen 1900 und ${currentYear} liegen.`);
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
            <SelectItem value="adult">Erwachsener</SelectItem>
            <SelectItem value="child">Kind</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Geburtsjahr"
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
            Kirchensteuerpflichtig
          </Label>
        </div>

        {p.kirchensteuer_aktiv === 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate">Bundesland:</Label>
            <Select
              value={p.bundesland ?? ""}
              onValueChange={(val) => void onUpdate(p.id, { bundesland: val })}
            >
              <SelectTrigger className="w-[210px] h-8 text-xs"><SelectValue placeholder="Bundesland wählen…" /></SelectTrigger>
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
        <Label className="text-xs text-slate">Auch bekannt als (für Transfer-Erkennung)</Label>
        <div className="flex flex-wrap items-center gap-2">
          {aliases?.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-xs text-slate"
            >
              {a.alias}
              <button
                type="button"
                aria-label={`Alias ${a.alias} entfernen`}
                onClick={async () => {
                  await removePersonAlias(a.id);
                  invalidateAliases();
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
            placeholder="+ Namensvariante"
            className="h-7 w-40 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

export function ProfilPage() {
  const queryClient = useQueryClient();
  const currency = useSettingsStore((s) => s.currency);
  const setCurrency = useSettingsStore((s) => s.setCurrency);

  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const setDateDisplayFormat = useSettingsStore((s) => s.setDateDisplayFormat);

  const importReminderDays = useSettingsStore((s) => s.importReminderDays);
  const setImportReminderDays = useSettingsStore((s) => s.setImportReminderDays);

  const { data: persons } = usePersons();
  const { data: assets } = useAssets(false);
  const accountAssets = assets?.filter((a) => a.kind === "account") ?? [];

  const [ownerPending, setOwnerPending] = useState<Record<number, Set<number>>>({});
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonAlias, setNewPersonAlias] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInputText, setDeleteInputText] = useState("");

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
        showErrorToast("Mindestens ein Person-Owner ist erforderlich.");
        return;
      }
      current.delete(personId);
    } else {
      current.add(personId);
    }
    setOwnerPending((prev) => ({ ...prev, [assetId]: current }));
    await updateAsset(assetId, { owner_ids: [...current] });
    queryClient.invalidateQueries({ queryKey: ["assets"] });
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
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      queryClient.invalidateQueries({ queryKey: ["person-aliases", personId] });
      toast.success("Person hinzugefügt");
    } catch (e) {
      showErrorToast(`Fehler beim Hinzufügen: ${String(e)}`);
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
    queryClient.invalidateQueries({ queryKey: ["persons"] });
  }

  async function handleRemovePerson(id: number) {
    if ((persons ?? []).length <= 1) {
      showErrorToast("Die letzte Person kann nicht entfernt werden.");
      return;
    }
    await deletePerson(id);
    queryClient.invalidateQueries({ queryKey: ["persons"] });
    toast.success("Person entfernt");
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
      toast.success("Backup erfolgreich heruntergeladen");
    } catch (e) {
      showErrorToast(`Export fehlgeschlagen: ${String(e)}`);
    }
  }

  async function handleImportBackupFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        await importBackupJson(text);
        queryClient.invalidateQueries();
        toast.success("Backup erfolgreich wiederhergestellt");
      } catch (err) {
        showErrorToast(`Import fehlgeschlagen: ${String(err)}`);
      }
    };
    reader.readAsText(file);
  }

  async function handleWipeData() {
    if (deleteInputText.trim().toLowerCase() !== "löschen") return;
    try {
      await deleteAllData();
      queryClient.invalidateQueries();
      toast.success("Alle Daten wurden gelöscht.");
      window.location.reload();
    } catch (e) {
      showErrorToast(`Fehler beim Löschen: ${String(e)}`);
    } finally {
      setDeleteConfirmOpen(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div>
        <h1 className="font-heading text-xl text-charcoal">Profil & Einstellungen</h1>
        <p className="text-sm text-slate">Verwalte Personen, Einstellungen, Backups und Daten.</p>
      </div>

      {/* 1. PERSONEN & ZUORDNUNG */}
      <div className="space-y-6 rounded-card border border-border bg-card p-6">
        <h2 className="font-heading text-lg text-charcoal">Personen</h2>
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
                placeholder="Name neuer Person…"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <div className="space-y-1">
              <Input
                placeholder="Wie steht der Name in Bank-Buchungen? (Pflicht)"
                value={newPersonAlias}
                onChange={(e) => setNewPersonAlias(e.target.value)}
                className="max-w-xs"
              />
              <p className="text-xs text-slate">Wird für die Transfer- und Konto-Erkennung benötigt.</p>
            </div>
            <Button onClick={handleAddPerson} disabled={!newPersonName.trim() || !newPersonAlias.trim()}>
              <Plus className="size-4" /> Person
            </Button>
          </div>
        </div>

        {persons && persons.length > 0 && accountAssets.length > 0 && (
          <div className="pt-4 border-t border-border space-y-3">
            <h3 className="text-sm font-semibold text-charcoal">Person-Konto-Zuordnung</h3>
            <div className="overflow-auto rounded-klein border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-accent">
                    <th className="px-3 py-2 text-left font-medium text-charcoal">Konto</th>
                    {persons.map((p) => (
                      <th key={p.id} className="px-3 py-2 text-center font-medium text-charcoal">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accountAssets.map((asset) => (
                    <tr key={asset.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-charcoal">{asset.name}</td>
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

      {/* 2. ALLGEMEIN */}
      <div className="space-y-6 rounded-card border border-border bg-card p-6">
        <h2 className="font-heading text-lg text-charcoal">Allgemein</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="language">Sprache</Label>
            <Select value="de" disabled>
              <SelectTrigger id="language"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="de">Deutsch</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Währung</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">Euro (€)</SelectItem>
                <SelectItem value="USD">US-Dollar ($)</SelectItem>
                <SelectItem value="CHF">Schweizer Franken (CHF)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date-format">Datumsformat</Label>
            <Select value={dateDisplayFormat} onValueChange={(val: any) => setDateDisplayFormat(val)}>
              <SelectTrigger id="date-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dd.MM.yyyy">dd.MM.yyyy (31.12.2023)</SelectItem>
                <SelectItem value="yyyy-MM-dd">yyyy-MM-dd (2023-12-31)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-reminder">Import-Erinnerung (Tage)</Label>
            <Input
              id="import-reminder"
              type="number"
              value={importReminderDays}
              onChange={(e) => setImportReminderDays(parseInt(e.target.value, 10) || 0)}
            />
          </div>
        </div>
      </div>

      {/* 3. DATEN & BACKUP */}
      <div className="space-y-6 rounded-card border border-border bg-card p-6">
        <h2 className="font-heading text-lg text-charcoal">Daten & Backup</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleExportBackup}>
            <Download className="size-4" /> Backup exportieren
          </Button>
          <label className="cursor-pointer">
            <Button variant="outline" asChild>
              <span><Upload className="size-4" /> Backup importieren</span>
            </Button>
            <input type="file" accept=".json" className="hidden" onChange={handleImportBackupFile} />
          </label>
        </div>
        <p className="text-xs text-slate">Backups werden im JSON-Format exportiert und können vollständig wiederhergestellt werden.</p>
      </div>

      {/* 5. BENUTZERDEFINIERTE FELDER */}
      <div className="space-y-6 rounded-card border border-border bg-card p-6">
        <h2 className="font-heading text-lg text-charcoal">Benutzerdefinierte Felder</h2>
        <CustomFieldsManager />
      </div>

      {/* BANK-VORLAGEN */}
      <div className="space-y-6 rounded-card border border-border bg-card p-6">
        <h2 className="font-heading text-lg text-charcoal">Bank-Vorlagen</h2>
        <BankTemplateManager />
      </div>

      {/* 6. ÜBER */}
      <div className="space-y-4 rounded-card border border-border bg-card p-6">
        <h2 className="font-heading text-lg text-charcoal">Über Klarwert</h2>
        <div className="text-sm text-slate space-y-1">
          <p>Version 0.1.0 (Lokale Desktop Finanz-App)</p>
          <p>100 % lokal, private SQLite-Datenbank, kein Login, keine Cloud.</p>
        </div>
        <div className="border-t border-border pt-4">
          <UpdateChecker />
        </div>
      </div>

      {/* 7. GEFAHRENZONE */}
      <div className="space-y-4 rounded-card border border-brick/30 bg-brick/5 p-6">
        <h2 className="font-heading text-lg text-brick">Gefahrenzone</h2>
        <p className="text-sm text-slate">
          Löscht alle gespeicherten Daten (Konten, Transaktionen, Kategorien, Regeln).
        </p>
        <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
          <Trash2 className="size-4" /> Alle Daten löschen
        </Button>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Alle Daten unwiderruflich löschen?"
        description="Gib 'löschen' ein, um das Zurücksetzen der App zu bestätigen."
        confirmLabel="Endgültig löschen"
        onConfirm={handleWipeData}
      >
        <Input
          placeholder="löschen"
          value={deleteInputText}
          onChange={(e) => setDeleteInputText(e.target.value)}
          className="mt-3"
        />
      </ConfirmDialog>
    </div>
  );
}
