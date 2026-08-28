import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCategories, groupCategories } from "@/hooks/useCategories";

interface CategorySelectProps {
  value: number | null;
  onChange: (categoryId: number | null) => void;
  placeholder?: string;
  allowNone?: boolean;
  amountCents?: number;
  disabled?: boolean;
}

export function CategorySelect({ value, onChange, placeholder, allowNone = true, amountCents, disabled }: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const { data: categories } = useCategories();
  const rawGroups = groupCategories(categories ?? []);

  const targetDirection = amountCents !== undefined ? (amountCents > 0 ? "einnahme" : "ausgabe") : null;

  const groups = rawGroups.slice().sort((a, b) => {
    if (targetDirection) {
      const dirA = a.parent.direction;
      const dirB = b.parent.direction;
      if (dirA === targetDirection && dirB !== targetDirection) return -1;
      if (dirA !== targetDirection && dirB === targetDirection) return 1;
    }
    return a.parent.sort_order - b.parent.sort_order;
  });

  // Finde das Label für die aktuelle Auswahl
  let selectedLabel = placeholder ?? "Kategorie wählen";
  if (value === null && allowNone) {
    selectedLabel = "Unkategorisiert";
  } else if (value !== null) {
    for (const group of groups) {
      const match = group.options.find((o) => o.category.id === value);
      if (match) {
        selectedLabel = match.label;
        break;
      }
    }
  }

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selectedLabel}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[280px] max-w-[360px] p-0" align="start">
        <Command filter={(value, search) => {
          if (value.toLowerCase().includes(search.toLowerCase())) return 1;
          return 0;
        }}>
          <CommandInput placeholder="Suchen..." />
          <CommandList className="max-h-[300px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
            <CommandEmpty>Keine Kategorie gefunden.</CommandEmpty>
            
            {allowNone && (
              <CommandGroup>
                <CommandItem
                  value="Unkategorisiert"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === null ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Unkategorisiert
                </CommandItem>
              </CommandGroup>
            )}

            {groups.map(({ parent, options }) => {
              const isMatch = !targetDirection || parent.direction === targetDirection;
              return (
                <CommandGroup key={parent.id} heading={parent.name} className={cn(!isMatch && "opacity-60")}>
                  {options.map((o) => (
                    <CommandItem
                      key={o.category.id}
                      value={o.label}
                      onSelect={() => {
                        onChange(o.category.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === o.category.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
