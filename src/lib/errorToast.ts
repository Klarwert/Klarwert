import { toast } from "sonner";
import { AppError } from "@/lib/errors";

/**
 * Fehler-Toast mit Kopieren-Button (Bugfix-Runde 3, Punkt 7): Toasts verschwinden automatisch,
 * bevor man den Text in Ruhe markieren/kopieren kann – ein direkter Button ist robuster als reine
 * Textmarkierung (die zusätzlich per CSS in index.css wieder aktiviert wurde).
 */
export function showErrorToast(error: string | Error | AppError): void {
  const isAppError = error instanceof AppError;
  const message = typeof error === "string" ? error : error.message;
  const detailToCopy = isAppError && error.technicalDetail ? `${message}\n\nTechnical details:\n${error.technicalDetail}` : typeof error === "string" ? error : error.stack || error.message;

  toast.error(message, {
    action: {
      label: "Kopieren",
      onClick: () => {
        void navigator.clipboard.writeText(detailToCopy);
      },
    },
  });
}
