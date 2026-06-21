import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Building2, Network, ShieldAlert, Users, Wallet } from "lucide-react";
import { ReportLeaderDialog } from "@/components/dashboard/report-leader-dialog";

type Action = {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
  accent: string;
};

const MEMBER_ACTIONS: Action[] = [
  {
    title: "Money",
    description: "Withdrawals, upkeep, balance checks, and transaction history.",
    to: "/dashboard/money",
    icon: Wallet,
    accent: "bg-emerald-500/10 text-emerald-700",
  },
  {
    title: "Team",
    description: "Invite codes, downline, and the people connected to you.",
    to: "/dashboard/team",
    icon: Users,
    accent: "bg-sky-500/10 text-sky-700",
  },
  {
    title: "Structure",
    description: "See the hierarchy and where everyone sits.",
    to: "/dashboard/structure",
    icon: Network,
    accent: "bg-violet-500/10 text-violet-700",
  },
];

const LEADER_ACTIONS: Action[] = [
  {
    title: "Team",
    description: "Find members, approve requests, add deposits, and manage ranks.",
    to: "/dashboard/team",
    icon: Users,
    accent: "bg-sky-500/10 text-sky-700",
  },
  {
    title: "Money",
    description: "Withdrawals, fund rules, purse, upkeep, and reconciliation.",
    to: "/dashboard/money",
    icon: Wallet,
    accent: "bg-emerald-500/10 text-emerald-700",
  },
  {
    title: "Office",
    description: "Office support ledger, expenses, and shared team costs.",
    to: "/dashboard/office",
    icon: Building2,
    accent: "bg-amber-500/10 text-amber-700",
  },
  {
    title: "Structure",
    description: "Navigate the wider organisation and reporting lines.",
    to: "/dashboard/structure",
    icon: Network,
    accent: "bg-violet-500/10 text-violet-700",
  },
];

export function DashboardQuickActions({ role }: { role: "member" | "leader" }) {
  const actions = role === "leader" ? LEADER_ACTIONS : MEMBER_ACTIONS;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Quick access</p>
          <h2 className="mt-1 text-lg font-semibold">What do you need to do?</h2>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="group rounded-xl border bg-background p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`flex size-10 items-center justify-center rounded-lg ${action.accent}`}>
                <action.icon className="size-5" />
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <h3 className="mt-3 font-semibold">{action.title}</h3>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{action.description}</p>
          </Link>
        ))}

        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </div>
          <h3 className="mt-3 font-semibold">Confidential report</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Privately report a leader with details, offence type, WhatsApp, and optional proof.
          </p>
          <div className="mt-3">
            <ReportLeaderDialog featured />
          </div>
        </div>
      </div>
    </section>
  );
}
