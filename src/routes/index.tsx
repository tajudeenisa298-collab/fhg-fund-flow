import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Wallet,
  Users,
  ArrowRight,
  Bell,
  BarChart3,
  Receipt,
  Smartphone,
  Star,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FHG Funds — Transparent fund management for FHG & NeoLife" },
      {
        name: "description",
        content:
          "Track managed funds, request withdrawals, and grow your team with full transparency.",
      },
      { property: "og:title", content: "FHG Funds — Transparent fund management" },
      {
        property: "og:description",
        content:
          "A secure online ledger for FHG members and NeoLife Directors. Replace spreadsheets, build trust.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: ShieldCheck, title: "Secure by design", body: "Per-user access rules, RLS-backed ledger, and signed receipts on every withdrawal." },
  { icon: Wallet, title: "Real-time balances", body: "Members see their managed balance update the instant a deposit or upkeep clears." },
  { icon: Receipt, title: "Printable receipts", body: "Approved withdrawals generate a receipt with a sha-256 hash anyone can verify." },
  { icon: Bell, title: "Live notifications", body: "Pending requests, upkeep due, dispute updates — all pushed in real time." },
  { icon: BarChart3, title: "Leader analytics", body: "Cash-flow trends, top contributors, churn and cohort retention out of the box." },
  { icon: Smartphone, title: "Mobile-ready", body: "Install to your home screen and keep working when the network is flaky." },
];

const TESTIMONIALS = [
  {
    quote: "We used to argue about who owed what every Friday. Now everyone just opens the app and the conversation is over.",
    name: "Adaeze Okafor",
    role: "Director, Lagos team",
  },
  {
    quote: "Approving withdrawals went from a 30-message WhatsApp thread to two taps. My members trust the numbers now.",
    name: "Tunde Bakare",
    role: "Team Leader",
  },
  {
    quote: "The weekly digest catches things I'd miss — pending requests, members about to fall behind on upkeep.",
    name: "Ifeoma Eze",
    role: "Director, Abuja team",
  },
];

const FAQS = [
  {
    q: "Who is this for?",
    a: "Team leaders and directors in FHG / NeoLife who hold member funds and want a clean record instead of spreadsheets and screenshots.",
  },
  {
    q: "Where is my money?",
    a: "Funds are held by your leader exactly as they were before. The app is a transparent ledger on top — it doesn't move money on its own.",
  },
  {
    q: "Can my member see other members' balances?",
    a: "No. Row-level security ensures each member only ever reads their own balance and history. Leaders see their direct team only.",
  },
  {
    q: "What happens if I leave the team?",
    a: "Your record is preserved and your final balance is settled by your leader. You can export your statement as a PDF at any time.",
  },
];

function Landing() {
  const { session, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && session) nav({ to: "/dashboard" });
  }, [loading, session, nav]);

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-primary shadow-elegant">
            <Wallet className="size-5 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">FHG Funds</span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#testimonials" className="hover:text-foreground">Testimonials</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10 md:pt-20">
        {/* HERO */}
        <section className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            For FHG members & NeoLife Directors
          </span>
          <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight md:text-6xl">
            Transparent fund management
            <br className="hidden md:block" /> your team will actually trust
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
            Replace spreadsheets with a secure online ledger. Members see their balance in real
            time, leaders approve withdrawals, and disputes get resolved in-app.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="shadow-elegant">
              <Link to="/signup">
                Create your account <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">I already have one</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">No card required · Sign up in under a minute</p>
        </section>

        {/* MOCK SCREENSHOT */}
        <section aria-hidden className="mt-16">
          <DashboardPreview />
        </section>

        {/* FEATURES */}
        <section id="features" className="mt-24">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Everything you need, nothing you don't</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Built with input from real team leaders. Every feature solves a problem a spreadsheet couldn't.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border bg-card p-6 shadow-card">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section id="testimonials" className="mt-24">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Loved by leaders who used to dread Fridays</h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-card">
                <div className="flex gap-0.5 text-warning" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="size-4 fill-current" />)}
                </div>
                <blockquote className="mt-3 flex-1 text-sm text-foreground">"{t.quote}"</blockquote>
                <figcaption className="mt-4 border-t pt-3">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>


        {/* FAQ */}
        <section id="faq" className="mt-24">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Frequently asked</h2>
          </div>
          <dl className="mx-auto mt-10 max-w-3xl space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-2xl border bg-card p-5 shadow-card open:shadow-elegant">
                <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold">
                  {f.q}
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <dd className="mt-2 text-sm text-muted-foreground">{f.a}</dd>
              </details>
            ))}
          </dl>
        </section>

        {/* CTA */}
        <section className="mt-24 rounded-3xl border bg-gradient-primary p-10 text-center text-primary-foreground shadow-elegant">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Ready to ditch the spreadsheet?</h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
            Sign up in under a minute. Invite your team and you're live the same day.
          </p>
          <div className="mt-6 flex justify-center">
            <Button asChild size="lg" variant="secondary">
              <Link to="/signup">
                Create your account <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t bg-card/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} FHG Funds. Built for the foundation, by the foundation.</p>
          <div className="flex gap-4">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}


function DashboardPreview() {
  return (
    <div className="rounded-3xl border bg-card p-3 shadow-elegant md:p-5">
      <div className="rounded-2xl bg-gradient-soft p-4 md:p-8">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-primary">
              <Wallet className="size-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">Dashboard</span>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
            <Bell className="size-4" /> 3 pending
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { label: "Total funds held", value: "$12,480", icon: Wallet },
            { label: "Members", value: "24", icon: Users },
            { label: "Pending", value: "3", icon: Bell },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <s.icon className="size-3.5" /> {s.label}
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">Recent activity</p>
          <ul className="mt-2 divide-y text-sm">
            {[
              ["Adaeze O.", "Deposit", "+$200.00", "text-success"],
              ["Tunde B.", "Upkeep dispensed", "−$40.00", "text-muted-foreground"],
              ["Ifeoma E.", "Withdrawal approved", "−$120.00", "text-muted-foreground"],
            ].map(([who, what, amt, cls]) => (
              <li key={who as string} className="flex items-center justify-between py-2">
                <span><strong className="font-medium">{who}</strong> · <span className="text-muted-foreground">{what}</span></span>
                <span className={`font-mono ${cls}`}>{amt}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
