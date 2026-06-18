import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv, downloadCsv } from "@/lib/csv";

/**
 * Tiny reusable "Export CSV" button. Renders a small outline button that
 * serialises `rows` via `toCsv` and triggers a download. Disabled (with a
 * helpful tooltip) when the list is empty.
 *
 * Pass `getRow` to project each row into a flat CSV-friendly shape — e.g.
 * resolve referenced names, format dates — without mutating display data.
 */
export function ExportCsvButton<T>({
  filename,
  rows,
  getRow,
  columns,
  label = "Export CSV",
  size = "sm",
}: {
  filename: string;
  rows: T[];
  getRow?: (row: T) => Record<string, unknown>;
  columns?: string[];
  label?: string;
  size?: "sm" | "default";
}) {
  const disabled = rows.length === 0;
  const handle = () => {
    const flat = rows.map((r) =>
      getRow ? getRow(r) : (r as unknown as Record<string, unknown>),
    );
    const csv = toCsv(flat, columns as (keyof (typeof flat)[number])[] | undefined);
    const stamp = new Date().toISOString().slice(0, 10);
    const safe = filename.replace(/[^a-z0-9_-]+/gi, "_");
    downloadCsv(`${safe}_${stamp}.csv`, csv);
  };
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={handle}
      disabled={disabled}
      title={disabled ? "Nothing to export yet" : `Export ${rows.length} rows`}
      className="gap-1.5"
    >
      <Download className="size-3.5" />
      {label}
    </Button>
  );
}
