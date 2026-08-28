import { Input } from "@/components/ui/input";
import { formatAmountInputOnBlur } from "@/lib/money";

/** Formatiertes Eingabefeld für Euro-Beträge mit Tausendertrennzeichen (Punkt). */
export function FormattedEuroInput({
  value,
  onChange,
  className = "",
  placeholder = "",
  id,
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  return (
    <Input
      id={id}
      value={value}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        // Nur Zahlen, Komma und Punkt erlauben (während der Eingabe)
        const val = e.target.value.replace(/[^0-9.,]/g, "");
        onChange(val);
      }}
      onBlur={(e) => {
        // Beim Verlassen formatieren (10000 -> 10.000)
        onChange(formatAmountInputOnBlur(e.target.value));
      }}
    />
  );
}
