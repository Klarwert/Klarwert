import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ParsedFile } from "@/lib/import/parseFile";
import type { Asset } from "@/db/types";

interface FileSelectionStepProps {
  accountAssets: Asset[];
  selectedAssetId: number;
  setSelectedAssetId: (id: number) => void;
  dragOver: boolean;
  setDragOver: (over: boolean) => void;
  file: File | null;
  fileError: string | null;
  parsedFile: ParsedFile | null;
  onFileSelected: (f: File) => void;
}

export function FileSelectionStep({
  accountAssets,
  selectedAssetId,
  setSelectedAssetId,
  dragOver,
  setDragOver,
  file,
  fileError,
  parsedFile,
  onFileSelected,
}: FileSelectionStepProps) {
  const { t } = useTranslation(["app"]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="import-asset">{t("import.accountMapping.title")}</Label>
        <Select
          value={String(selectedAssetId)}
          onValueChange={(v) => setSelectedAssetId(Number(v))}
        >
          <SelectTrigger id="import-asset" className="max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accountAssets.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className={cn(
          "flex min-h-[100px] flex-col items-center justify-center gap-2 rounded-standard border-2 border-dashed p-6 text-center text-sm",
          dragOver ? "border-petrol bg-petrol/5" : "border-border",
          fileError && "border-brick",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) onFileSelected(dropped);
        }}
      >
        {file ? (
          <span className="text-charcoal">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </span>
        ) : (
          <span className="text-slate">{t("import.file.dragDrop")}</span>
        )}
        <label>
          <span className="cursor-pointer text-petrol underline">{t("import.file.title")}</span>
          <input
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) onFileSelected(selected);
            }}
          />
        </label>
      </div>
      {fileError && <p className="text-sm text-brick">{fileError}</p>}
      {parsedFile && !fileError && (
        <p className="text-xs text-slate">
          Erkannt: Encoding {parsedFile.detected.encoding}
          {parsedFile.detected.delimiter ? `, Trennzeichen "${parsedFile.detected.delimiter}"` : ""}, Dezimalformat{" "}
          {parsedFile.detected.decimalFormat}, Datumsformat {parsedFile.detected.dateFormat}
        </p>
      )}
    </div>
  );
}
