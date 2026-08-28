import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { ParsedFile } from "@/lib/import/parseFile";

interface ProgressStepProps {
  parsedFile: ParsedFile | null;
  matchedProfileName: string | null;
  useMultiAccount: boolean;
  accountMapDraft: Record<string, unknown>;
  progressPhase: "reading" | "saving" | "pipeline" | "finalizing" | null;
  progressDone: number;
  progressTotal: number;
}

export function ProgressStep({
  parsedFile,
  matchedProfileName,
  useMultiAccount,
  accountMapDraft,
  progressPhase,
  progressDone,
  progressTotal,
}: ProgressStepProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      {parsedFile && (
        <ul className="w-full max-w-sm space-y-1.5 self-start text-sm text-charcoal">
          <li className="flex items-center gap-2">
            <Check className="size-4 text-sage" />
            <span>
              {t("import.progress.fileDetected", { encoding: parsedFile.detected.encoding })}
              {parsedFile.detected.delimiter ? t("import.progress.delimiterSuffix", { delimiter: parsedFile.detected.delimiter }) : ""}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Check className="size-4 text-sage" />
            <span>{t("import.progress.rowsFound", { count: parsedFile.rows.length })}</span>
          </li>
          <li className="flex items-center gap-2">
            <Check className="size-4 text-sage" />
            <span>
              {matchedProfileName
                ? t("import.progress.profileMatched", { name: matchedProfileName })
                : t("import.progress.profileNew")}
            </span>
          </li>
          {useMultiAccount && (
            <li className="flex items-center gap-2">
              <Check className="size-4 text-sage" />
              <span>{t("import.progress.accountsDetected", { count: Object.keys(accountMapDraft).length })}</span>
            </li>
          )}
        </ul>
      )}
      <div className="h-2 w-full overflow-hidden rounded-pill bg-accent">
        <div
          className="h-full bg-petrol transition-all duration-300"
          style={{ width: `${progressTotal > 0 ? (progressDone / progressTotal) * 100 : 0}%` }}
        />
      </div>
      <p className="text-sm text-slate">
        {progressPhase === "reading" && t("import.progress.phaseReading")}
        {progressPhase === "saving" && t("import.progress.phaseSaving", { done: progressDone, total: progressTotal })}
        {progressPhase === "pipeline" && t("import.progress.phasePipeline")}
        {progressPhase === "finalizing" && t("import.progress.phaseFinalizing")}
        {!progressPhase && t("import.progress.loading")}
      </p>
    </div>
  );
}
