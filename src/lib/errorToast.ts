import { toast } from "sonner";

/**
 * Fehler-Toast mit Kopieren-Button (Bugfix-Runde 3, Punkt 7): Toasts verschwinden automatisch,
 * bevor man den Text in Ruhe markieren/kopieren kann – ein direkter Button ist robuster als reine
 * Textmarkierung (die zusätzlich per CSS in index.css wieder aktiviert wurde).
 */
export function showErrorToast(message: string): void {
  toast.error(message, {
    action: {
      label: "Kopieren",
      onClick: () => {
        void navigator.clipboard.writeText(message);
      },
    },
  });
}
