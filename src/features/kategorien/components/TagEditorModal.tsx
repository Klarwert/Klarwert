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
import { createTag, updateTag } from "@/db/repositories/tags";
import type { Tag } from "@/db/types";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/errorToast";
import { useTranslation } from "react-i18next";

const COLOR_SWATCHES = ["#4a6fa5", "#b79a5b", "#c07a4a", "#6b7a80", "#6f9a6d", "#8a5fa0", "#b6503a"];

interface TagEditorModalProps {
  open: boolean;
  tag: Tag | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function TagEditorModal({ open, tag, onOpenChange, onSaved }: TagEditorModalProps) {
  const { t } = useTranslation(["kategorien", "app"]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(tag?.name ?? "");
    setColor(tag?.color ?? COLOR_SWATCHES[0]);
  }, [open, tag]);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      if (tag) await updateTag(tag.id, { name: name.trim(), color });
      else await createTag(name.trim(), color);
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
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{tag ? t("tags.editTitle") : t("tags.addTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">{t("tags.name")}</Label>
            <Input id="tag-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("tags.color")}</Label>
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("app:common.cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !name.trim()}>
            {t("app:common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
