import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { GripVertical, ChevronUp, ChevronDown, Pencil, Trash2, Plus } from "lucide-react";
import { useRules } from "@/hooks/useRules";
import { useCategories } from "@/hooks/useCategories";
import { useTags } from "@/hooks/useTags";
import { deleteRule, reorderRules, swapRulePriority, type RuleWithConditions } from "@/db/repositories/rules";
import { addHistoryEntry, logSoftDelete } from "@/db/repositories/historyLog";
import { reevaluateAllRuleBasedTransactions } from "@/lib/pipeline";
import { RuleEditorModal } from "@/features/kategorien/components/RuleEditorModal";
import { toast } from "sonner";

interface RulesManagerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELD_LABELS: Record<string, string> = {
  purpose: "Zweck",
  counterparty: "Empfänger",
  amount: "Betrag",
  asset: "Konto",
};
const OPERATOR_LABELS: Record<string, string> = {
  contains: "enthält",
  equals: "ist",
  approx: "≈",
};

function ruleText(rule: RuleWithConditions): string {
  return rule.groups
    .map((g) => g.conditions.map((c) => `${FIELD_LABELS[c.field]} ${OPERATOR_LABELS[c.operator]} "${c.value}"`).join(" UND "))
    .join(" ODER ");
}

function SortableRuleRow({
  rule,
  index,
  total,
  categoryName,
  tagName,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  rule: RuleWithConditions;
  index: number;
  total: number;
  categoryName: string | null;
  tagName: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: rule.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-klein border border-border bg-card p-2 text-sm"
    >
      <button {...attributes} {...listeners} aria-label="Ziehen zum Umsortieren" className="cursor-grab text-slate">
        <GripVertical className="size-4" />
      </button>
      <div className="flex flex-col">
        <Button size="icon" variant="ghost" className="h-5 w-5" aria-label="Nach oben" onClick={onMoveUp} disabled={index === 0}>
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5"
          aria-label="Nach unten"
          onClick={onMoveDown}
          disabled={index === total - 1}
        >
          <ChevronDown className="size-3.5" />
        </Button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-charcoal">{ruleText(rule)}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {categoryName && <Badge variant="outline">{categoryName}</Badge>}
          {tagName && <Badge variant="outline">{tagName}</Badge>}
          {rule.mark_as_transfer === 1 && <Badge variant="outline">Transfer</Badge>}
          {rule.mark_as_saving === 1 && <Badge variant="outline">Sparen</Badge>}
          {rule.created_from === "aufraeumen" && <Badge variant="secondary" className="bg-slate/10 text-slate">Auto (Aufräumen)</Badge>}
          {rule.created_from === "vertrag" && <Badge variant="secondary" className="bg-slate/10 text-slate">Auto (Vertrag)</Badge>}
        </div>
      </div>
      <Button size="icon" variant="ghost" aria-label="Bearbeiten" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" aria-label="Löschen" onClick={onDelete}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export function RulesManagerDrawer({ open, onOpenChange }: RulesManagerDrawerProps) {
  const { data: rules, refetch } = useRules();
  const { data: categories } = useCategories();
  const { data: tags } = useTags();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleWithConditions | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RuleWithConditions | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function categoryName(id: number | null): string | null {
    return id ? categories?.find((c) => c.id === id)?.name ?? null : null;
  }
  function tagName(id: number | null): string | null {
    return id ? tags?.find((t) => t.id === id)?.name ?? null : null;
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!rules) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rules.findIndex((r) => r.id === active.id);
    const newIndex = rules.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(rules, oldIndex, newIndex);
    const previousOrder = rules.map((r) => r.id);
    await reorderRules(reordered.map((r) => r.id));
    await addHistoryEntry({
      action_type: "rule_reorder",
      description: "Regel-Reihenfolge geändert",
      payload: { previousOrder },
    });
    await reevaluateAllRuleBasedTransactions();
    void refetch();
    toast.success("Reihenfolge aktualisiert");
  }

  async function handleMove(index: number, dir: -1 | 1) {
    if (!rules) return;
    const other = rules[index + dir];
    if (!other) return;
    const previousOrder = rules.map((r) => r.id);
    await swapRulePriority(rules[index].id, other.id);
    await addHistoryEntry({
      action_type: "rule_reorder",
      description: "Regel-Reihenfolge geändert",
      payload: { previousOrder },
    });
    await reevaluateAllRuleBasedTransactions();
    void refetch();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteRule(deleteTarget.id);
    await logSoftDelete("rules", deleteTarget.id, `Regel gelöscht: ${ruleText(deleteTarget)}`);
    await reevaluateAllRuleBasedTransactions();
    setDeleteTarget(null);
    void refetch();
    toast.success("Regel gelöscht");
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[430px] overflow-y-auto sm:max-w-[430px]">
          <SheetHeader>
            <SheetTitle>Regeln verwalten</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <Button
              size="sm"
              onClick={() => {
                setEditingRule(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="mr-1.5 size-4" />
              Neue Regel
            </Button>
            {rules && rules.length > 0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
                <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {rules.map((rule, i) => (
                      <SortableRuleRow
                        key={rule.id}
                        rule={rule}
                        index={i}
                        total={rules.length}
                        categoryName={categoryName(rule.category_id)}
                        tagName={tagName(rule.tag_id)}
                        onEdit={() => {
                          setEditingRule(rule);
                          setEditorOpen(true);
                        }}
                        onDelete={() => setDeleteTarget(rule)}
                        onMoveUp={() => void handleMove(i, -1)}
                        onMoveDown={() => void handleMove(i, 1)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="text-sm text-slate">Noch keine Regeln angelegt.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <RuleEditorModal
        open={editorOpen}
        rule={editingRule}
        onOpenChange={setEditorOpen}
        onSaved={() => void refetch()}
      />

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title="Regel löschen?"
          description="Bereits kategorisierte Transaktionen bleiben unverändert (keine rückwirkende Entkategorisierung)."
          confirmLabel="Löschen"
          onConfirm={() => void handleDelete()}
        />
      )}
    </>
  );
}
