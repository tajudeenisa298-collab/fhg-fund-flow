import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DateRange {
  from: string; // YYYY-MM-DD or ""
  to: string;
}

export const EMPTY_RANGE: DateRange = { from: "", to: "" };

export function DateRangeFilter({
  value,
  onChange,
  className = "",
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  className?: string;
}) {
  const active = Boolean(value.from || value.to);
  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <div className="space-y-1">
        <Label htmlFor="dr-from" className="text-[10px] uppercase tracking-wide text-muted-foreground">
          From
        </Label>
        <Input
          id="dr-from"
          type="date"
          value={value.from}
          max={value.to || undefined}
          className="h-8 w-[140px] text-xs"
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="dr-to" className="text-[10px] uppercase tracking-wide text-muted-foreground">
          To
        </Label>
        <Input
          id="dr-to"
          type="date"
          value={value.to}
          min={value.from || undefined}
          className="h-8 w-[140px] text-xs"
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </div>
      {active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => onChange(EMPTY_RANGE)}
        >
          <X className="mr-1 size-3" /> Clear
        </Button>
      )}
    </div>
  );
}

/** Returns true when `iso` falls within `range`. Inclusive bounds; empty range matches all. */
export function inRange(iso: string | null | undefined, range: DateRange): boolean {
  if (!iso) return !range.from && !range.to;
  if (!range.from && !range.to) return true;
  const t = new Date(iso).getTime();
  if (range.from) {
    const fromT = new Date(range.from + "T00:00:00").getTime();
    if (t < fromT) return false;
  }
  if (range.to) {
    const toT = new Date(range.to + "T23:59:59.999").getTime();
    if (t > toT) return false;
  }
  return true;
}
