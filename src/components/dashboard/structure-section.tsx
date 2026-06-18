import { useEffect, useMemo, useState } from "react";
import { useUrlState } from "@/hooks/use-url-state";
import { ChevronDown, ChevronRight, Network, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { RANKS } from "@/lib/ranks";
import type { Profile } from "@/lib/auth-context";

interface Node {
  id: string;
  full_name: string;
  rank: string;
  balance_usd: number;
  avatar_url: string | null;
  sponsor_id: string | null;
  can_handle_funds: boolean;
}

type PeriodOption =
  | "current"
  | "last3"
  | "last6"
  | "last12"
  | "all"
  | "custom";

function periodRange(opt: PeriodOption, customMonth: string): { start: Date | null; end: Date | null; label: string } {
  const now = new Date();
  const startOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 1));
  const endOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
  switch (opt) {
    case "current": {
      const s = startOfMonth(now.getUTCFullYear(), now.getUTCMonth());
      const e = endOfMonth(now.getUTCFullYear(), now.getUTCMonth());
      return { start: s, end: e, label: "This month" };
    }
    case "last3":
    case "last6":
    case "last12": {
      const n = opt === "last3" ? 3 : opt === "last6" ? 6 : 12;
      const s = startOfMonth(now.getUTCFullYear(), now.getUTCMonth() - (n - 1));
      const e = endOfMonth(now.getUTCFullYear(), now.getUTCMonth());
      return { start: s, end: e, label: `Last ${n} months` };
    }
    case "all":
      return { start: null, end: null, label: "All time" };
    case "custom": {
      const [y, m] = customMonth.split("-").map(Number);
      const s = startOfMonth(y, m - 1);
      const e = endOfMonth(y, m - 1);
      return { start: s, end: e, label: customMonth };
    }
  }
}

function toIsoDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function StructureSection({ profile }: { profile: Profile }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [pvByMember, setPvByMember] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [rankFilter, setRankFilter] = useState<Set<string>>(new Set(RANKS));
  const [periodRaw, setPeriodRaw] = useUrlState("period", "current");
  const period = periodRaw as PeriodOption;
  const setPeriod = (v: PeriodOption) => setPeriodRaw(v);
  const today = new Date();
  const [customMonth, setCustomMonth] = useUrlState(
    "month",
    `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`,
  );

  const range = useMemo(() => periodRange(period, customMonth), [period, customMonth]);

  // Load downline + root
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_downline", { _root: profile.id });
      if (cancelled) return;
      const list: Node[] = error
        ? []
        : ((data ?? []) as Array<{
            id: string;
            full_name: string;
            rank: string;
            balance_usd: number;
            avatar_url: string | null;
            sponsor_id: string | null;
            can_handle_funds: boolean;
          }>).map((r) => ({
            id: r.id,
            full_name: r.full_name,
            rank: r.rank,
            balance_usd: Number(r.balance_usd),
            avatar_url: r.avatar_url,
            sponsor_id: r.sponsor_id,
            can_handle_funds: !!r.can_handle_funds,
          }));
      const root: Node = {
        id: profile.id,
        full_name: profile.full_name,
        rank: profile.rank,
        balance_usd: Number(profile.balance_usd),
        avatar_url: profile.avatar_url ?? null,
        sponsor_id: null,
        can_handle_funds: !!profile.can_handle_funds,
      };
      setNodes([root, ...list]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.id, profile.full_name, profile.rank, profile.balance_usd, profile.avatar_url]);

  // Load PV in range
  useEffect(() => {
    if (nodes.length === 0) return;
    let cancelled = false;
    (async () => {
      const ids = nodes.map((n) => n.id);
      let q = supabase.from("pv_logs").select("member_id, pv, period_month").in("member_id", ids);
      const s = toIsoDate(range.start);
      const e = toIsoDate(range.end);
      if (s) q = q.gte("period_month", s);
      if (e) q = q.lte("period_month", e);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        setPvByMember({});
        return;
      }
      const agg: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ member_id: string; pv: number }>) {
        agg[r.member_id] = (agg[r.member_id] ?? 0) + Number(r.pv);
      }
      setPvByMember(agg);
    })();
    return () => {
      cancelled = true;
    };
  }, [nodes, range.start, range.end]);

  // Build sponsor children map
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Node[]>();
    for (const n of nodes) {
      const key = n.sponsor_id;
      const list = map.get(key) ?? [];
      list.push(n);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return map;
  }, [nodes]);

  // Visible children: if a child's rank is filtered out, promote its descendants
  const visibleChildren = (id: string): Node[] => {
    const out: Node[] = [];
    const stack = [...(childrenOf.get(id) ?? [])];
    while (stack.length) {
      const c = stack.shift()!;
      if (rankFilter.has(c.rank)) {
        out.push(c);
      } else {
        // promote grandchildren
        stack.unshift(...(childrenOf.get(c.id) ?? []));
      }
    }
    return out;
  };

  const toggleNode = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleRank = (rank: string) =>
    setRankFilter((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });

  const allRanksSelected = rankFilter.size === RANKS.length;

  const root = nodes.find((n) => n.id === profile.id);

  const renderNode = (node: Node, depth: number) => {
    const kids = visibleChildren(node.id);
    const isCollapsed = collapsed.has(node.id);
    const pv = pvByMember[node.id] ?? 0;
    const isRoot = node.id === profile.id;
    return (
      <li key={node.id} className="relative">
        <div
          className={`flex items-center gap-2 rounded-xl border bg-card p-2.5 shadow-sm ${
            isRoot ? "border-primary/40 bg-primary/5" : ""
          }`}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleNode(node.id)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          ) : (
            <span className="inline-block w-5" />
          )}
          <UserAvatar name={node.full_name} avatarPath={node.avatar_url} className="size-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {node.full_name}
              {isRoot && <span className="ml-1.5 text-[10px] text-primary">(you)</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{node.rank}</p>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums">
              {pv.toLocaleString()} PV
            </span>
            {!node.can_handle_funds && <Money usd={node.balance_usd} size="sm" className="items-end" />}
          </div>
        </div>
        {kids.length > 0 && !isCollapsed && (
          <ul className="ml-5 mt-2 space-y-2 border-l-2 border-dashed border-border pl-4">
            {kids.map((k) => renderNode(k, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  // Aggregates over filtered (visible) subtree
  const visibleIds = useMemo(() => {
    if (!root) return new Set<string>();
    const set = new Set<string>([root.id]);
    const walk = (id: string) => {
      for (const c of visibleChildren(id)) {
        set.add(c.id);
        walk(c.id);
      }
    };
    walk(root.id);
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, childrenOf, rankFilter]);

  const totalPv = useMemo(
    () => Array.from(visibleIds).reduce((s, id) => s + (pvByMember[id] ?? 0), 0),
    [visibleIds, pvByMember]
  );
  const totalBalance = useMemo(
    () =>
      nodes.filter((n) => visibleIds.has(n.id) && !n.can_handle_funds).reduce((s, n) => s + n.balance_usd, 0),
    [nodes, visibleIds]
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Network className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Structure</h2>
            <p className="text-sm text-muted-foreground">
              Your sponsorship tree with PV and balances.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">This month</SelectItem>
              <SelectItem value="last3">Last 3 months</SelectItem>
              <SelectItem value="last6">Last 6 months</SelectItem>
              <SelectItem value="last12">Last 12 months</SelectItem>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="custom">Specific month…</SelectItem>
            </SelectContent>
          </Select>
          {period === "custom" && (
            <input
              type="month"
              value={customMonth}
              onChange={(e) => setCustomMonth(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            />
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Filter className="mr-1.5 size-4" />
                Ranks ({rankFilter.size}/{RANKS.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Show ranks</p>
                <button
                  type="button"
                  onClick={() =>
                    setRankFilter(allRanksSelected ? new Set() : new Set(RANKS))
                  }
                  className="text-xs text-primary hover:underline"
                >
                  {allRanksSelected ? "Clear" : "All"}
                </button>
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {RANKS.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={rankFilter.has(r)}
                      onCheckedChange={() => toggleRank(r)}
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">People</p>
          <p className="text-lg font-semibold">{visibleIds.size}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            PV · {range.label}
          </p>
          <p className="text-lg font-semibold tabular-nums">{totalPv.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balances</p>
          <Money usd={totalBalance} size="sm" />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-3 shadow-card sm:p-5">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading structure…</p>
        ) : !root ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>
        ) : rankFilter.size === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No ranks selected — pick at least one rank to view the tree.
          </p>
        ) : (
          <ul className="space-y-2">{renderNode(root, 0)}</ul>
        )}
      </div>
    </section>
  );
}
