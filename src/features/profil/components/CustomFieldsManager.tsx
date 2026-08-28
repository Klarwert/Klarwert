import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomFields } from "@/hooks/useCustomFields";
import { updateCustomField, deleteCustomField } from "@/db/repositories/customFields";

export function CustomFieldsManager() {
  const { t } = useTranslation("profil");
  const DATA_TYPE_LABELS = t("customFieldsManager.dataTypes", { returnObjects: true }) as unknown as Record<string, string>;
  const queryClient = useQueryClient();
  const { data: customFields } = useCustomFields();
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("text");

  function startEdit(id: number, name: string, dataType: string) {
    setEditId(id);
    setEditName(name);
    setEditType(dataType);
  }

  async function handleSave() {
    if (!editId) return;
    await updateCustomField(editId, editName.trim());
    setEditId(null);
    void queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
  }

  async function handleDelete(id: number) {
    if (!confirm(t("customFieldsManager.deleteConfirm"))) return;
    await deleteCustomField(id);
    void queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
  }

  if (!customFields || customFields.length === 0) {
    return <p className="text-sm text-slate">{t("customFieldsManager.empty")}</p>;
  }

  return (
    <div className="space-y-2">
      {customFields.map((field) => (
        <div key={field.id} className="flex items-center gap-3 rounded border border-border p-3">
          {editId === field.id ? (
            <>
              <Input
                className="h-7 flex-1 text-sm"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") setEditId(null); }}
                autoFocus
              />
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DATA_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => void handleSave()}>
                <Check className="size-4 text-sage" />
              </Button>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditId(null)}>
                <X className="size-4 text-slate" />
              </Button>
            </>
          ) : (
            <>
              <div className="flex-1">
                <div className="font-medium text-charcoal">{field.name}</div>
                <div className="text-xs text-slate">{t("customFieldsManager.type", { type: DATA_TYPE_LABELS[field.data_type] ?? field.data_type })}</div>
              </div>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => startEdit(field.id, field.name, field.data_type)}>
                <Pencil className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => void handleDelete(field.id)}>
                <Trash2 className="size-4 text-brick" />
              </Button>
            </>
          )}
        </div>
      ))}
      <p className="text-xs text-slate">{t("customFieldsManager.hint")}</p>
    </div>
  );
}
