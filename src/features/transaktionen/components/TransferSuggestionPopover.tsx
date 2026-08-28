import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCategorizationLogForTransaction } from "@/db/repositories/merchants";

interface TransferSuggestionPopoverProps {
  transactionId: number;
  /** Anzeigetext des Badges: Zielkategorie ("Kontentransfer") oder Sparzweck ("Sparen: Urlaub"). */
  label: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

/**
 * Kategorie-Badge für einen vorgeschlagenen (noch nicht bestätigten) Transfer: gestrichelt/gedimmt
 * dargestellt statt eines vollen Badges, mit Bestätigen/Trennen-Popover. Ersetzt das frühere
 * separate "Transfer?"-Badge in der Empfänger-Spalte – die Kategorie-Zelle allein trägt jetzt die
 * Information, konsistent mit jeder anderen Buchung (siehe Bugfix-Runde 3, Punkt 3).
 */
export function TransferSuggestionPopover({ transactionId, label, onConfirm, onDismiss }: TransferSuggestionPopoverProps) {
  const { t } = useTranslation("transaktionen");
  const { data: log } = useQuery({
    queryKey: ["categorization-log", transactionId],
    queryFn: () => getCategorizationLogForTransaction(transactionId),
  });

  // Konfidenz-Konvention (pipeline.ts): 1.0 = Stufe 1 IBAN-Vollmatch, 0.9 = Stufe 2 Gegenbuchungsmatch.
  const detectionLabel =
    log?.matched_by === "transfer"
      ? log.confidence >= 1.0
        ? t("transferSuggestion.detectedByIban")
        : t("transferSuggestion.detectedByAmount")
      : t("transferSuggestion.detectedGeneric");

  return (
    <Popover>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button type="button">
          <Badge variant="outline" className="border-dashed text-slate">
            {label}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 space-y-2" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs text-slate">{detectionLabel}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={onConfirm}>
            {t("transferSuggestion.confirmShort")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            {t("transferSuggestion.dismissShort")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
