import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/dates";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/lib/utils";

interface DateInputProps {
  /** ISO-Datum (yyyy-MM-dd) – Speicherung ist immer ISO, siehe CLAUDE.md Invariante 7. */
  value: string;
  onChange: (isoDate: string) => void;
  max?: string;
  min?: string;
  id?: string;
  className?: string;
}

/**
 * Eigener Datums-Picker statt nativem `<input type="date">`: dessen Anzeigeformat richtet sich nach
 * der Locale des jeweiligen Tauri-Webviews (WebKit/Chromium/WebKitGTK je Betriebssystem) und ignoriert
 * die App-Einstellung `settings.date_format_display` – das führte zu einem je nach Plattform falschen
 * Anzeigeformat. Diese Komponente formatiert selbst über `lib/dates.ts`.
 */
export function DateInput({ value, onChange, max, min, id, className }: DateInputProps) {
  const [open, setOpen] = useState(false);
  const dateDisplayFormat = useSettingsStore((s) => s.dateDisplayFormat);

  const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined;
  const maxDate = max ? new Date(`${max}T00:00:00`) : undefined;
  const minDate = min ? new Date(`${min}T00:00:00`) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn("w-full justify-start font-normal", className)}
        >
          <CalendarIcon className="mr-2 size-4 text-slate" />
          {value ? formatDate(value, dateDisplayFormat) : "Datum wählen"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={(d) => {
            if (!d) return;
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            onChange(iso);
            setOpen(false);
          }}
          disabled={(d) => (!!maxDate && d > maxDate) || (!!minDate && d < minDate)}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
