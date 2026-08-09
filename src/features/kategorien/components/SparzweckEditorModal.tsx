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
import { createSparzweck, updateSparzweck } from "@/db/repositories/sparzwecke";
import { parseAmountToCents } from "@/lib/money";
import type { Sparzweck } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";

const COLOR_SWATCHES = ["#2e6e5e", "#1d4750", "#b79a5b", "#3e8fa3", "#6b7a80", "#c07a4a", "#4a6fa5"];

interface SparzweckEditorModalProps {
  open: boolean;
  sparzweck: Sparzweck | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function SparzweckEditorModal({ open, sparzweck, onOpenChange, onSaved }: SparzweckEditorModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [target, setTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(sparzweck?.name ?? "");
    setColor(sparzweck?.color ?? COLOR_SWATCHES[0]);
    setTarget(sparzweck?.target_cents ? (sparzweck.target_cents / 100).toFixed(2).replace(".", ",") : "");
  }, [open, sparzweck]);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const targetCents = target.trim() ? parseAmountToCents(target) : null;
      if (sparzweck) {
        await updateSparzweck(sparzweck.id, { name: name.trim(), color, target_cents: targetCents });
      } else {
        await createSparzweck({ name: name.trim(), color, target_cents: targetCents });
      }
      toast.success("Sparzweck gespeichert");
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
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{sparzweck ? "Sparzweck bearbeiten" : "Sparzweck anlegen"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sz-name">Name</Label>
            <Input id="sz-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Farbe</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_SWATCHES.map((sw) => (
                <button
                  key={sw}
                  type="button"
                  onClick={() => setColor(sw)}
                  className="size-7 rounded-full"
                  style={{ backgroundColor: sw, boxShadow: color === sw ? `0 0 0 2px ${sw}` : undefined }}
                  aria-label={sw}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sz-target">Zielbetrag (optional)</Label>
            <Input id="sz-target" inputMode="decimal" placeholder="0,00" value={target} onChange={(e) => setTarget(e.target.value)} />
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
