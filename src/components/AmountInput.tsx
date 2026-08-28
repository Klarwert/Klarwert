import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { formatAmountInputOnBlur } from "@/lib/money";

interface AmountInputProps extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

/** Betrags-Eingabefeld: formatiert beim Verlassen des Felds automatisch mit Tausenderpunkt. */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { value, onChange, onBlur, ...props },
  ref,
) {
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        onChange(formatAmountInputOnBlur(e.target.value));
        onBlur?.(e);
      }}
      {...props}
    />
  );
});
