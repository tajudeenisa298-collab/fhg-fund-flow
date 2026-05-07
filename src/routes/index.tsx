import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Wallet, Users, ArrowRight } from "lucide-react";
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
    ],
  }),
  component: Landing,
});

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
        <section className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            For FHG members & NeoLife Directors
          </span>
          <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight md:text-6xl">
            Transparent fund management for your team
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
            Replace spreadsheets with a secure online ledger. Members see their balance in real
            time, leaders approve withdrawals, and trust grows automatically.
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
        </section>

        <section className="mt-20 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: "Secure by design",
              body: "Bank-grade authentication and per-user access rules keep every record private.",
            },
            {
              icon: Wallet,
              title: "Live balances",
              body: "Members always see what's held for them and the exchange rate of every move.",
            },
            {
              icon: Users,
              title: "Team hierarchy",
              body: "Invite codes automatically link new recruits to their Director.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border bg-card p-6 shadow-card transition-transform hover:-translate-y-0.5"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-primary">
                <Icon className="size-5 text-primary-foreground" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
