import { useTranslation } from "react-i18next";

interface HeaderConfirmStepProps {
  rawPreviewLines: string[][];
  onSelectHeaderRow: (index: number) => void;
}

export function HeaderConfirmStep({ rawPreviewLines, onSelectHeaderRow }: HeaderConfirmStepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate">{t("import.headerConfirm.description")}</p>
      <div className="overflow-auto rounded-klein border border-border">
        <table className="w-full text-xs">
          <tbody>
            {rawPreviewLines.map((row, i) => (
              <tr
                key={i}
                onClick={() => onSelectHeaderRow(i)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-accent"
              >
                <td className="w-8 border-r border-border p-2 text-center font-medium text-slate">
                  {i + 1}
                </td>
                {row.map((cell, j) => (
                  <td key={j} className="p-2 text-charcoal">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
