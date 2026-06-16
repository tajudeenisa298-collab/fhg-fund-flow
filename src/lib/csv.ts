/**
 * Tiny CSV utilities — used for member data takeout.
 */

function escape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns?: (keyof T)[]): string {
  if (rows.length === 0 && !columns) return "";
  const cols = (columns ?? (Object.keys(rows[0] ?? {}) as (keyof T)[])) as string[];
  const header = cols.map(escape).join(",");
  const body = rows.map((r) => cols.map((c) => escape((r as Record<string, unknown>)[c])).join(","));
  return [header, ...body].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
