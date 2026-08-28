import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  format,
} from "date-fns";
import { de } from "date-fns/locale";

export type PeriodType = "week" | "month" | "quarter" | "year";

export interface PeriodRange {
  from: string;
  to: string;
  label: string;
}

function iso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function getPeriodRange(type: PeriodType, anchor: Date): PeriodRange {
  switch (type) {
    case "week": {
      const from = startOfWeek(anchor, { weekStartsOn: 1 });
      const to = endOfWeek(anchor, { weekStartsOn: 1 });
      return { from: iso(from), to: iso(to), label: `KW ${format(from, "w")} · ${format(from, "yyyy")}` };
    }
    case "month": {
      const from = startOfMonth(anchor);
      const to = endOfMonth(anchor);
      return { from: iso(from), to: iso(to), label: format(from, "MMMM yyyy", { locale: de }) };
    }
    case "quarter": {
      const from = startOfQuarter(anchor);
      const to = endOfQuarter(anchor);
      return { from: iso(from), to: iso(to), label: `Q${format(from, "Q")} ${format(from, "yyyy")}` };
    }
    case "year": {
      const from = startOfYear(anchor);
      const to = endOfYear(anchor);
      return { from: iso(from), to: iso(to), label: format(from, "yyyy") };
    }
  }
}

export function shiftPeriod(type: PeriodType, anchor: Date, dir: 1 | -1): Date {
  switch (type) {
    case "week":
      return addWeeks(anchor, dir);
    case "month":
      return addMonths(anchor, dir);
    case "quarter":
      return addQuarters(anchor, dir);
    case "year":
      return addYears(anchor, dir);
  }
}
