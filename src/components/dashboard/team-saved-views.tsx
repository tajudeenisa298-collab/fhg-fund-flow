import type { Profile } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Users, AlertTriangle, MinusCircle, Landmark, UserX } from "lucide-react";

export type SavedView =
  | "all"
  | "suspended"
  | "negative"
  | "no_bank"
  | "no_whatsapp";

const PRESETS: {
  id: SavedView;
  label: string;
  icon: typeof Users;
  match: (m: Profile, ctx: { bankIds: Set<string> }) => boolean;
}[] = [
  { id: "all", label: "All", icon: Users, match: () => true },
  {
    id: "suspended",
    label: "Suspended",
    icon: AlertTriangle,
    match: (m) =>
      !!m.suspended_until && new Date(m.suspended_until).getTime() > Date.now(),
  },
  {
    id: "negative",
    label: "Negative balance",
    icon: MinusCircle,
    match: (m) => Number(m.balance_usd) < 0,
  },
  {
    id: "no_bank",
    label: "No bank on file",
    icon: Landmark,
    match: (m, ctx) => !ctx.bankIds.has(m.id),
  },
  {
    id: "no_whatsapp",
    label: "No WhatsApp",
    icon: UserX,
    match: (m) => !m.whatsapp_number,
  },
];

export function applySavedView(
  team: Profile[],
  view: SavedView,
  bankIds: Set<string>,
): Profile[] {
  const preset = PRESETS.find((p) => p.id === view) ?? PRESETS[0];
  return team.filter((m) => preset.match(m, { bankIds }));
}

export function TeamSavedViews({
  team,
  bankIds,
  active,
  onChange,
}: {
  team: Profile[];
  bankIds: Set<string>;
  active: SavedView;
  onChange: (v: SavedView) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">Views</span>
      {PRESETS.map((p) => {
        const Icon = p.icon;
        const count = team.filter((m) => p.match(m, { bankIds })).length;
        const isActive = active === p.id;
        return (
          <Button
            key={p.id}
            size="sm"
            variant={isActive ? "default" : "outline"}
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => onChange(p.id)}
          >
            <Icon className="size-3.5" />
            {p.label}
            <span
              className={`ml-1 rounded-full px-1.5 text-[10px] ${
                isActive ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
              }`}
            >
              {count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
