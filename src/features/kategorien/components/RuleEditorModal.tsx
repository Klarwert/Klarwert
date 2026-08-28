import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelect } from "@/components/CategorySelect";
import { useTags } from "@/hooks/useTags";
import { useSparzwecke } from "@/hooks/useSparzwecke";
import { reevaluateAllRuleBasedTransactions } from "@/lib/pipeline";
import {
  createRuleWithGroups,
  updateRuleWithGroups,
  type RuleConditionInput,
  type RuleWithConditions,
} from "@/db/repositories/rules";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import { useTranslation } from "react-i18next";
import { RuleConditionGroupsEditor, cleanRuleGroups, newRuleCondition, ruleGroupsToDraft } from "./RuleConditionGroupsEditor";

interface RuleEditorModalProps {
  open: boolean;
  rule: RuleWithConditions | null;
  defaultCategoryId?: number | null;
  defaultConditions?: RuleConditionInput[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * Regel-Builder: zweistufige UND/ODER-Struktur (Gruppen sind ODER-verknüpft, Bedingungen
 * innerhalb einer Gruppe UND-verknüpft), Feldauswahl inkl. dynamischer extra_fields_json-Schlüssel
 * aus dem Import, Beträge mit größer/kleiner/zwischen, durchsuchbarer Werte-Picker aus echten
 * Buchungsdaten, durchsuchbare Trefferliste statt nur Anzahl (siehe prompt-regelbuilder-erweiterung.md).
 */
export function RuleEditorModal({ open, rule, defaultCategoryId, defaultConditions, onOpenChange, onSaved }: RuleEditorModalProps) {
  const { t } = useTranslation(["kategorien", "app"]);
  const [groups, setGroups] = useState<RuleConditionInput[][]>(
    defaultConditions ? [defaultConditions] : [[newRuleCondition()]],
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tagId, setTagId] = useState<number | null>(null);
  const [markAsTransfer, setMarkAsTransfer] = useState(false);
  const [markAsSaving, setMarkAsSaving] = useState(false);
  const [sparzweckId, setSparzweckId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: tags } = useTags();
  const { data: sparzwecke } = useSparzwecke();

  useEffect(() => {
    if (!open) return;
    if (rule) {
      setGroups(ruleGroupsToDraft(rule));
      setCategoryId(rule.category_id);
      setTagId(rule.tag_id);
      setMarkAsTransfer(!!rule.mark_as_transfer);
      setMarkAsSaving(!!rule.mark_as_saving);
      setSparzweckId(rule.sparzweck_id);
    } else {
      setGroups(defaultConditions ? [defaultConditions] : [[newRuleCondition()]]);
      setCategoryId(defaultCategoryId ?? null);
      setTagId(null);
      setMarkAsTransfer(false);
      setMarkAsSaving(false);
      setSparzweckId(null);
    }
  }, [open, rule, defaultCategoryId, defaultConditions]);

  const hasCompleteCondition = groups.some((g) => g.some((c) => c.value.trim()));
  const hasAction = !!categoryId || !!tagId || markAsTransfer || markAsSaving;

  async function handleSubmit() {
    const cleanedGroups = cleanRuleGroups(groups);
    if (cleanedGroups.length === 0 || !hasAction) return;
    setSubmitting(true);
    try {
      const actions = {
        category_id: categoryId,
        tag_id: tagId,
        mark_as_transfer: markAsTransfer,
        mark_as_saving: markAsSaving,
        sparzweck_id: markAsSaving ? sparzweckId : null,
      };
      if (rule) {
        await updateRuleWithGroups(rule.id, cleanedGroups, actions);
      } else {
        await createRuleWithGroups(cleanedGroups, actions);
      }
      await reevaluateAllRuleBasedTransactions();
      toast.success(t("app:common.success"));
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`${t("app:errors.unknownError")}: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{rule ? t("rules.editTitle") : t("rules.addTitle")}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <RuleConditionGroupsEditor groups={groups} onChange={setGroups} />

          <div className="space-y-3 rounded-standard border border-border p-3">
            <Label>{t("rules.actions")}</Label>
            <CategorySelect value={categoryId} onChange={setCategoryId} placeholder={t("rules.assignCategory")} />
            <Select
              value={tagId ? String(tagId) : "none"}
              onValueChange={(v) => setTagId(v === "none" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("rules.assignTag")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("rules.noTag")}</SelectItem>
                {tags?.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between">
              <Label htmlFor="rule-transfer">{t("rules.markAsTransfer")}</Label>
              <Switch id="rule-transfer" checked={markAsTransfer} onCheckedChange={setMarkAsTransfer} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="rule-saving">{t("rules.markAsSaving")}</Label>
              <Switch id="rule-saving" checked={markAsSaving} onCheckedChange={setMarkAsSaving} />
            </div>
            {markAsSaving && (
              <Select
                value={sparzweckId ? String(sparzweckId) : "none"}
                onValueChange={(v) => setSparzweckId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("rules.assignSavingsGoal")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("rules.noSavingsGoal")}</SelectItem>
                  {sparzwecke?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("app:common.cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !hasCompleteCondition || !hasAction}>
            {t("app:common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
