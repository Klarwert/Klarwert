import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, Trash2, Plus, ChevronDown } from "lucide-react";
import { CategorySelect } from "@/components/CategorySelect";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/AmountInput";
import { DateInput } from "@/components/DateInput";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RuleEditorModal } from "@/features/kategorien/components/RuleEditorModal";
import { useTags } from "@/hooks/useTags";
import { useSparzwecke } from "@/hooks/useSparzwecke";
import { createTag } from "@/db/repositories/tags";
import {
  deleteManualTransaction,
  setTransactionTags,
  updateTransaction,
  type TransactionWithTags,
} from "@/db/repositories/transactions";
import { formatEur, parseAmountToCents } from "@/lib/money";
import { todayIso, formatDate } from "@/lib/dates";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { listCollections, addTransactionsToCollection, removeTransactionFromCollection, getTransactionCollectionIds } from "@/db/repositories/collections";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCustomFields } from "@/hooks/useCustomFields";
import { useTransactionCustomValues } from "@/hooks/useTransactionCustomValues";
import { setCustomValue } from "@/db/repositories/customFields";
import { LearnDialog } from "@/features/transaktionen/components/LearnDialog";
import { useCategories } from "@/hooks/useCategories";
import { getCategorizationLogForTransaction, listMerchants } from "@/db/repositories/merchants";
import { listRules } from "@/db/repositories/rules";
import type { CategorizationAlternative, CategorizationMatchedBy } from "@/db/types";
import { showErrorToast } from "@/lib/errorToast";

const STAGE_LABELS: Partial<Record<CategorizationMatchedBy, string>> = {
  manual: "Manuell gesetzt",
  contract: "Automatisch über Vertrag",
  transfer: "Automatisch über Transfer-Erkennung",
  similarity: "Ähnlichkeits-Fallback (eigene Historie)",
  none: "Keine automatische Zuordnung",
};

const RULE_FIELD_LABELS: Record<string, string> = {
  purpose: "Zweck",
  counterparty: "Empfänger",
  amount: "Betrag",
  asset: "Konto",
  custom: "Feld",
};

const RULE_OPERATOR_LABELS: Record<string, string> = {
  contains: "enthält",
  equals: "=",
  approx: "≈",
};

const EXTRA_FIELD_LABELS: Record<string, string> = {
  transaction_type: "Transaktionstyp",
  card_payment_at: "Karteneinsatz-Zeitpunkt",
  cash_withdrawal_at: "Bargeldabhebung-Zeitpunkt",
  recipient_iban: "Empfänger-IBAN",
  recipient_bic: "Empfänger-BIC",
  recipient_account_number: "Empfänger-Kontonummer",
  description: "Beschreibung",
  bank_category: "Bank-Kategorie",
  bank_subcategory: "Bank-Unterkategorie",
  bank_account_label: "Kontoname (Bank)",
};

const NEW_TAG_COLORS = ["#4a6fa5", "#b79a5b", "#c07a4a", "#6b7a80", "#6f9a6d"];

interface TransactionDrawerProps {
  transaction: TransactionWithTags | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function TransactionDrawer({ transaction, onOpenChange, onSaved }: TransactionDrawerProps) {
  const queryClient = useQueryClient();
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);
  const { data: tags } = useTags();
  const { data: sparzwecke } = useSparzwecke();
  const { data: allCollections } = useQuery({
    queryKey: ["collections"],
    queryFn: listCollections,
  });
  const { data: categorizationLog } = useQuery({
    queryKey: ["categorization-log", transaction?.id],
    queryFn: () => getCategorizationLogForTransaction(transaction!.id),
    enabled: !!transaction,
  });
  const { data: allMerchants } = useQuery({ queryKey: ["merchants", "all-for-transparency"], queryFn: listMerchants });
  const { data: allRules } = useQuery({ queryKey: ["rules"], queryFn: listRules });
  const { data: allCategoriesFlat } = useCategories();
  const activeCollections = (allCollections ?? []).filter((c: any) => c.is_deleted === 0 && c.status === "active");
  const [newTagName, setNewTagName] = useState("");
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [learnDialogState, setLearnDialogState] = useState<{
    original: TransactionWithTags;
    newCategoryId: number;
    newCategoryName: string;
  } | null>(null);

  const [bookingDate, setBookingDate] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [sparzweckId, setSparzweckId] = useState<number | null>(null);
  const [isReviewed, setIsReviewed] = useState(true);
  const [isTransfer, setIsTransfer] = useState(false);
  const [excludeFromStats, setExcludeFromStats] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [collectionIds, setCollectionIds] = useState<number[]>([]);

  const { data: customFields } = useCustomFields();
  const { data: initialCustomValues } = useTransactionCustomValues(transaction?.id ?? null);
  const [customValues, setCustomValues] = useState<Record<number, string>>({});

  useEffect(() => {
    if (initialCustomValues) {
      const map: Record<number, string> = {};
      for (const v of initialCustomValues) {
        map[v.custom_field_id] = v.value;
      }
      setCustomValues(map);
    }
  }, [initialCustomValues]);

  useEffect(() => {
    if (transaction) {
      setBookingDate(transaction.booking_date);
      setCounterparty(transaction.counterparty);
      setPurpose(transaction.purpose ?? "");
      setAmount((transaction.amount_cents / 100).toFixed(2).replace(".", ","));
      setCategoryId(transaction.category_id);
      setTagIds(transaction.tag_ids);
      setIsSaving(!!transaction.is_saving);
      setSparzweckId(transaction.sparzweck_id);
      setIsReviewed(!!transaction.is_reviewed);
      setIsTransfer(!!transaction.is_transfer);
      setExcludeFromStats(!!transaction.exclude_from_stats);
      // Load collection memberships
      getTransactionCollectionIds(transaction.id).then(setCollectionIds);
    }
  }, [transaction]);

  if (!transaction) return null;
  const isImported = transaction.source === "import";

  let extraFields: Record<string, string> = {};
  if (transaction.extra_fields_json) {
    try {
      extraFields = JSON.parse(transaction.extra_fields_json);
    } catch {
      extraFields = {};
    }
  }
  const extraFieldEntries = Object.entries(extraFields).filter(([, v]) => v);

  function merchantLabel(id: number | null | undefined): string {
    if (!id) return "unbekannter Händler";
    return allMerchants?.find((m) => m.id === id)?.display_name ?? `Händler #${id}`;
  }

  function categoryLabel(id: number | null | undefined): string {
    if (!id) return "keine Kategorie";
    return allCategoriesFlat?.find((c) => c.id === id)?.name ?? `Kategorie #${id}`;
  }

  function ruleLabel(id: number | null | undefined): string {
    const rule = id ? allRules?.find((r) => r.id === id) : undefined;
    const condition = rule?.groups[0]?.conditions[0];
    if (!condition) return "Automatisch über Benutzerregel";
    const field = RULE_FIELD_LABELS[condition.field] ?? condition.field;
    const operator = RULE_OPERATOR_LABELS[condition.operator] ?? condition.operator;
    return `Benutzerregel: ${field} ${operator} „${condition.value}"`;
  }

  function stageLabel(matchedBy: CategorizationMatchedBy, ruleId: number | null, merchantId: number | null): string {
    if (matchedBy === "user_rule") return ruleLabel(ruleId);
    if (matchedBy === "merchant_iban") return `Händler-Datenbank · IBAN-Treffer: ${merchantLabel(merchantId)}`;
    if (matchedBy === "merchant_alias") return `Händler-Datenbank · Alias-Treffer: ${merchantLabel(merchantId)}`;
    return STAGE_LABELS[matchedBy] ?? "Keine automatische Zuordnung";
  }

  function alternativeLabel(alt: CategorizationAlternative): string {
    const confidencePercent = Math.round(alt.confidence * 100);
    if (alt.matched_by === "similarity") {
      return `Ähnlichkeit → ${categoryLabel(alt.category_id)} (${confidencePercent} % Konfidenz)`;
    }
    return `${merchantLabel(alt.merchant_id)} → ${categoryLabel(alt.category_id)} (${confidencePercent} % Konfidenz)`;
  }

  let logAlternatives: CategorizationAlternative[] = [];
  if (categorizationLog?.alternatives_json) {
    try {
      logAlternatives = JSON.parse(categorizationLog.alternatives_json);
    } catch {
      logAlternatives = [];
    }
  }

  // Transfer=ja/Sparen=ja: Kategorie wird durch die Markierung abgeleitet und ist gesperrt
  // (Product Spec Kap. 3, "Kategorie-Kopplung"). Zum Ändern muss die Markierung zuerst aufgehoben werden.
  const categoryLocked = isTransfer || isSaving;
  const kontentransferCategoryId = allCategoriesFlat?.find((c) => c.template_key === "bank_kredit.kontentransfer")?.id ?? null;

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    const color = NEW_TAG_COLORS[Math.floor(Math.random() * NEW_TAG_COLORS.length)];
    const id = await createTag(newTagName.trim(), color);
    setTagIds((prev) => [...prev, id]);
    setNewTagName("");
    queryClient.invalidateQueries({ queryKey: ["tags"] });
  }

  async function handleSave() {
    if (!transaction) return;
    setSubmitting(true);
    try {
      const isManual = transaction.source === "manual";
      await updateTransaction(transaction.id, {
        category_id: categoryId,
        categorization_source: categoryId ? "manual" : "none",
        is_saving: isSaving ? 1 : 0,
        sparzweck_id: isSaving ? sparzweckId : null,
        is_reviewed: isReviewed ? 1 : 0,
        is_transfer: isTransfer ? 1 : 0,
        exclude_from_stats: excludeFromStats ? 1 : 0,
        ...(isManual
          ? {
              booking_date: bookingDate,
              counterparty: counterparty.trim(),
              purpose: purpose.trim() || null,
              amount_cents: parseAmountToCents(amount),
            }
          : {}),
      });
      await setTransactionTags(transaction.id, tagIds);
      
      // Save custom fields
      if (customFields) {
        for (const field of customFields) {
          const val = customValues[field.id];
          await setCustomValue(transaction.id, field.id, val ?? null);
        }
      }

      toast.success("Änderungen gespeichert");
      onSaved();

      const wasAutomatic = (
        ["rule", "contract", "transfer", "merchant", "similarity"] as string[]
      ).includes(transaction.categorization_source);
      const categoryChanged = categoryId !== null && categoryId !== transaction.category_id;
      if (wasAutomatic && categoryChanged) {
        setLearnDialogState({
          original: transaction,
          newCategoryId: categoryId!,
          newCategoryName: categoryLabel(categoryId),
        });
      } else {
        onOpenChange(false);
      }
    } catch (e) {
      showErrorToast(`Fehler: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!transaction) return;
    await deleteManualTransaction(transaction.id);
    toast.success("Transaktion gelöscht");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Sheet open={!!transaction} onOpenChange={onOpenChange}>
      <SheetContent className="w-[390px] overflow-y-auto sm:max-w-[390px]">
        <SheetHeader>
          <SheetTitle>Transaktion</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {isImported && (
            <div className="flex items-center gap-1.5 rounded-klein bg-accent px-3 py-2 text-xs text-slate">
              <Lock className="size-3.5" />
              Importierte Daten – Korrektur über neuen Import
            </div>
          )}

          {isImported ? (
            <div className="space-y-1 text-sm">
              <div className="font-medium text-charcoal">{transaction.counterparty}</div>
              {transaction.purpose && <div className="text-slate">{transaction.purpose}</div>}
              <div className="flex items-center gap-2 text-xs text-slate">
                <span>{formatDate(transaction.booking_date, dateDisplayFormat)}</span>
                <span className="num text-sm text-charcoal">{formatEur(transaction.amount_cents)}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-date">Datum</Label>
                  <DateInput id="tx-date" max={todayIso()} value={bookingDate} onChange={setBookingDate} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tx-amount">Betrag</Label>
                  <div className="relative">
                    <AmountInput
                      id="tx-amount"
                      value={amount}
                      onChange={setAmount}
                      className="pr-6 text-right"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate">
                      €
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tx-counterparty">Empfänger</Label>
                <Input id="tx-counterparty" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tx-purpose">Zweck</Label>
                <Input id="tx-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Kategorie</Label>
              {categoryLocked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help text-slate" aria-label="Kategorie durch Markierung gesperrt">
                      <Lock className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Kategorie wird durch die Markierung gesetzt – zum Ändern zuerst Markierung aufheben
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <div>
              <CategorySelect
                value={categoryId}
                onChange={setCategoryId}
                amountCents={transaction.amount_cents}
                disabled={categoryLocked}
              />
            </div>
            <div className="rounded-md border border-cream-dark/60 bg-cream/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate">
                  {categorizationLog
                    ? stageLabel(categorizationLog.matched_by, categorizationLog.rule_id, categorizationLog.merchant_id)
                    : transaction.categorization_source === "manual"
                      ? "Manuell gesetzt"
                      : "Keine automatische Zuordnung"}
                </p>
                {categorizationLog && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {Math.round(categorizationLog.confidence * 100)} % Konfidenz
                  </Badge>
                )}
              </div>
              {logAlternatives.length > 0 && (
                <Collapsible className="mt-1.5">
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-slate underline underline-offset-2">
                    <ChevronDown className="size-3" />
                    Knapp unterlegene Alternativen ({logAlternatives.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1 space-y-0.5 pl-4">
                    {logAlternatives.map((alt, i) => (
                      <p key={i} className="text-xs text-slate/80">
                        {alternativeLabel(alt)}
                      </p>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            {tags && tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const active = tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setTagIds((prev) =>
                          active ? prev.filter((id) => id !== t.id) : [...prev, t.id],
                        )
                      }
                      className="rounded-pill border px-2.5 py-1 text-xs"
                      style={{
                        borderColor: t.color,
                        backgroundColor: active ? t.color : "transparent",
                        color: active ? "#fffdf8" : t.color,
                      }}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate">Keine Tags vorhanden.</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Neuer Tag…"
                maxLength={30}
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateTag();
                  }
                }}
              />
              <Button size="sm" variant="ghost" onClick={() => void handleCreateTag()} disabled={!newTagName.trim()}>
                <Plus className="mr-1 size-3.5" />
                Anlegen
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="tx-saving">Sparen</Label>
            <Switch id="tx-saving" checked={isSaving} onCheckedChange={setIsSaving} />
          </div>
          {isSaving && (
            <Select
              value={sparzweckId ? String(sparzweckId) : "none"}
              onValueChange={(v) => setSparzweckId(v === "none" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Sparzweck</SelectItem>
                {sparzwecke?.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="tx-reviewed">Geprüft</Label>
            <Switch id="tx-reviewed" checked={isReviewed} onCheckedChange={setIsReviewed} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="tx-transfer">Transfer</Label>
            <Switch
              id="tx-transfer"
              checked={isTransfer}
              onCheckedChange={(checked) => {
                setIsTransfer(checked);
                if (checked && kontentransferCategoryId) setCategoryId(kontentransferCategoryId);
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="tx-exclude">Aus Statistik entfernt</Label>
            <Switch id="tx-exclude" checked={excludeFromStats} onCheckedChange={setExcludeFromStats} />
          </div>

          {transaction.is_transfer === 1 && (
            <Badge className="bg-sage text-card hover:bg-sage">Transfer</Badge>
          )}

          {customFields && customFields.length > 0 && (
            <div className="pt-2">
              <Label className="mb-2 block text-sm">Zusatzfelder</Label>
              <div className="space-y-3">
                {customFields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <Label htmlFor={`cf-${field.id}`} className="text-xs font-normal text-slate">{field.name}</Label>
                    <Input
                      id={`cf-${field.id}`}
                      type={field.data_type === "integer" || field.data_type === "decimal" ? "number" : field.data_type === "date" || field.data_type === "datetime" ? "date" : "text"}
                      className="h-8"
                      value={customValues[field.id] ?? ""}
                      onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {extraFieldEntries.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm text-petrol">
                <ChevronDown className="size-4" />
                Weitere Bankdaten
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1.5">
                {extraFieldEntries.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 text-xs">
                    <span className="text-slate">{EXTRA_FIELD_LABELS[key] ?? key}</span>
                    <span className="text-right text-charcoal">{value}</span>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="pt-2">
            <Label className="mb-2 block text-sm">Sammlungen</Label>
            <div className="flex flex-wrap gap-1.5">
              {activeCollections.map((col) => {
                const isIn = collectionIds.includes(col.id);
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={async () => {
                      if (isIn) {
                        await removeTransactionFromCollection(col.id, transaction.id);
                        setCollectionIds((prev) => prev.filter((id) => id !== col.id));
                      } else {
                        await addTransactionsToCollection(col.id, [transaction.id]);
                        setCollectionIds((prev) => [...prev, col.id]);
                      }
                    }}
                    className={`rounded-pill border px-2.5 py-1 text-xs transition-colors ${
                      isIn
                        ? "border-petrol bg-petrol text-card"
                        : "border-border bg-accent text-charcoal hover:bg-accent/70"
                    }`}
                  >
                    {col.name}
                  </button>
                );
              })}
              {activeCollections.length === 0 && (
                <p className="text-xs text-slate">Keine aktiven Sammlungen.</p>
              )}
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setRuleEditorOpen(true)}
            >
              Regel aus dieser Transaktion erstellen
            </Button>
          </div>
        </div>

        <RuleEditorModal
          open={ruleEditorOpen}
          rule={null}
          defaultCategoryId={categoryId}
          defaultConditions={[
            { field: "counterparty", operator: "equals", value: counterparty },
          ]}
          onOpenChange={setRuleEditorOpen}
          onSaved={() => {
            // Nothing specific needed, user might save tx afterwards
          }}
        />

        <SheetFooter className="mt-6 flex-row justify-between sm:justify-between">
          {transaction.source === "manual" ? (
            <Button variant="ghost" className="text-brick" onClick={() => void handleDelete()}>
              <Trash2 className="mr-1.5 size-4" />
              Löschen
            </Button>
          ) : (
            <span />
          )}
          <Button
            onClick={() => void handleSave()}
            disabled={submitting || (!isImported && (!counterparty.trim() || !amount.trim()))}
          >
            Speichern
          </Button>
        </SheetFooter>
      </SheetContent>
      {learnDialogState && (
        <LearnDialog
          open={!!learnDialogState}
          onOpenChange={(o) => {
            if (!o) {
              setLearnDialogState(null);
              onOpenChange(false);
            }
          }}
          transaction={learnDialogState.original}
          newCategoryId={learnDialogState.newCategoryId}
          newCategoryName={learnDialogState.newCategoryName}
          onDone={() => {
            setLearnDialogState(null);
            onOpenChange(false);
          }}
        />
      )}
    </Sheet>
  );
}
