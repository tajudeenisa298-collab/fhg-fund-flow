import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { downloadCsv } from "@/lib/csv";
import type { UpkeepFrequency } from "@/lib/types";

type Kind = "upkeep_plans" | "rank_defaults";

const TEMPLATES: Record<Kind, { headers: string[]; sample: string }> = {
  upkeep_plans: {
    headers: ["member_email", "amount_usd", "frequency", "custom_days"],
    sample:
      "member_email,amount_usd,frequency,custom_days\njane@example.com,5,weekly,\nmark@example.com,10,custom_days,4\n",
  },
  rank_defaults: {
    headers: ["rank", "amount_ngn", "frequency", "custom_days"],
    sample:
      "rank,amount_ngn,frequency,custom_days\nMember,8000,weekly,\nDirector,25000,monthly,\n",
  },
};

const FREQS: UpkeepFrequency[] = [
  "every_3_days",
  "weekly",
  "biweekly",
  "monthly",
  "custom_days",
];

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    head.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function computeNext(freq: UpkeepFrequency, custom: number | null): string {
  const days =
    freq === "every_3_days" ? 3 :
    freq === "weekly" ? 7 :
    freq === "biweekly" ? 14 :
    freq === "monthly" ? 30 :
    Math.max(1, custom ?? 1);
  return new Date(Date.now() + days * 86400000).toISOString();
}

export function CsvImportDialog({
  kind,
  leaderId,
  onDone,
}: {
  kind: Kind;
  leaderId: string;
  onDone: () => void;
}) {
  const { ngnRate } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);

  const tpl = TEMPLATES[kind];

  const downloadTemplate = () => {
    downloadCsv(`${kind}_template.csv`, tpl.sample);
  };

  const onFile = async (f: File | null | undefined) => {
    if (!f) return;
    setText(await f.text());
  };

  const submit = async () => {
    const rows = parseCsv(text);
    if (rows.length === 0) return toast.error("No rows found");
    setBusy(true);
    setReport(null);
    const errors: string[] = [];
    let ok = 0;

    if (kind === "upkeep_plans") {
      // Resolve emails → member ids (must be on this leader's team)
      const emails = rows.map((r) => r.member_email?.toLowerCase()).filter(Boolean);
      const { data: members } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("leader_id", leaderId)
        .in("email", emails);
      const byEmail = new Map(
        ((members as { id: string; email: string | null }[]) ?? []).map((m) => [
          m.email?.toLowerCase() ?? "",
          m.id,
        ]),
      );

      for (const [i, row] of rows.entries()) {
        const ln = i + 2;
        try {
          const email = (row.member_email ?? "").toLowerCase();
          const memberId = byEmail.get(email);
          if (!memberId) throw new Error(`row ${ln}: no team member with email ${email}`);
          const amount = Number(row.amount_usd);
          if (!(amount > 0)) throw new Error(`row ${ln}: amount_usd must be > 0`);
          const freq = row.frequency as UpkeepFrequency;
          if (!FREQS.includes(freq)) throw new Error(`row ${ln}: bad frequency "${row.frequency}"`);
          const custom = row.custom_days ? Number(row.custom_days) : null;
          if (freq === "custom_days" && !(custom && custom > 0))
            throw new Error(`row ${ln}: custom_days required for custom_days frequency`);
          const { error } = await supabase.from("upkeep_plans").upsert(
            {
              leader_id: leaderId,
              member_id: memberId,
              amount_usd: Number(amount.toFixed(4)),
              frequency: freq,
              custom_days: freq === "custom_days" ? custom : null,
              next_run_at: computeNext(freq, custom),
              active: true,
            },
            { onConflict: "member_id" },
          );
          if (error) throw new Error(`row ${ln}: ${error.message}`);
          ok++;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    } else {
      // rank_defaults
      for (const [i, row] of rows.entries()) {
        const ln = i + 2;
        try {
          const rank = row.rank?.trim();
          if (!rank) throw new Error(`row ${ln}: rank required`);
          const ngn = Number(row.amount_ngn);
          if (!(ngn > 0)) throw new Error(`row ${ln}: amount_ngn must be > 0`);
          const freq = row.frequency as UpkeepFrequency;
          if (!FREQS.includes(freq)) throw new Error(`row ${ln}: bad frequency "${row.frequency}"`);
          const custom = row.custom_days ? Number(row.custom_days) : null;
          if (freq === "custom_days" && !(custom && custom > 0))
            throw new Error(`row ${ln}: custom_days required for custom_days frequency`);
          const usd = Number((ngn / Math.max(ngnRate, 1)).toFixed(4));
          const { error } = await supabase.from("rank_upkeep_defaults").upsert(
            {
              leader_id: leaderId,
              rank,
              amount_usd: usd,
              frequency: freq,
              custom_days: freq === "custom_days" ? custom : null,
            },
            { onConflict: "leader_id,rank" },
          );
          if (error) throw new Error(`row ${ln}: ${error.message}`);
          ok++;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    }

    setBusy(false);
    setReport({ ok, fail: errors.length, errors: errors.slice(0, 20) });
    if (ok > 0) {
      toast.success(`Imported ${ok} row${ok === 1 ? "" : "s"}`);
      onDone();
    }
    if (errors.length > 0) toast.error(`${errors.length} row(s) failed`);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="mr-1 size-3.5" /> Import CSV
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5" />
              Import {kind === "upkeep_plans" ? "upkeep plans" : "rank defaults"}
            </DialogTitle>
            <DialogDescription>
              Columns required: <code className="rounded bg-muted px-1">{tpl.headers.join(", ")}</code>.
              Existing rows are overwritten (upsert).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onFile(e.target.files?.[0])}
                className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs"
              />
              <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                <Download className="mr-1 size-3.5" /> Template
              </Button>
            </div>
            <Textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tpl.sample}
              className="font-mono text-xs"
            />
            {report && (
              <div className="rounded-xl border bg-muted/30 p-3 text-xs">
                <p className="font-semibold">
                  ✓ {report.ok} imported · ✗ {report.fail} failed
                </p>
                {report.errors.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-destructive">
                    {report.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Close
            </Button>
            <Button onClick={submit} disabled={busy || !text.trim()}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
