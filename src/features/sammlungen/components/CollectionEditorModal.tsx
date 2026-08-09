import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createCollection, updateCollection } from "@/db/repositories/collections";
import { parseAmountToCents } from "@/lib/money";
import type { Collection } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

interface CollectionEditorModalProps {
  open: boolean;
  collection: Collection | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function CollectionEditorModal({ open, collection, onOpenChange, onSaved }: CollectionEditorModalProps) {
  const [name, setName] = useState("");
  const [isGoal, setIsGoal] = useState(false);
  const [target, setTarget] = useState("");
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(collection?.name ?? "");
    setIsGoal(!!collection?.is_goal);
    setTarget(collection?.target_cents ? (collection.target_cents / 100).toFixed(2).replace(".", ",") : "");
    setCompleted(collection?.status === "completed");
  }, [open, collection]);

  async function handleSubmit() {
    if (!name.trim()) return;
    if (isGoal && !target.trim()) return;
    setSubmitting(true);
    try {
      const targetCents = isGoal && target.trim() ? parseAmountToCents(target) : null;
      const status = completed ? "completed" : "active";
      if (collection) {
        await updateCollection(collection.id, { name: name.trim(), is_goal: isGoal, target_cents: targetCents, status });
      } else {
        await createCollection({ name: name.trim(), is_goal: isGoal, target_cents: targetCents, status });
      }
      toast.success("Sammlung gespeichert");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      showErrorToast(`Fehler: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{collection ? "Sammlung bearbeiten" : "Sammlung anlegen"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="coll-name">Name</Label>
            <Input id="coll-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="coll-goal">Sparziel mit Zielbetrag</Label>
            <Switch id="coll-goal" checked={isGoal} onCheckedChange={setIsGoal} />
          </div>
          {isGoal && (
            <div className="space-y-1.5">
              <Label htmlFor="coll-target">Zielbetrag</Label>
              <Input
                id="coll-target"
                inputMode="decimal"
                placeholder="0,00"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="coll-completed">Abgeschlossen</Label>
            <Switch id="coll-completed" checked={completed} onCheckedChange={setCompleted} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !name.trim()}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
