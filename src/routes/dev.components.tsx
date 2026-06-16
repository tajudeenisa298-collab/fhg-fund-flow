import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/dashboard/stat-card";
import { Wallet, Users } from "lucide-react";

export const Route = createFileRoute("/dev/components")({
  head: () => ({
    meta: [
      { title: "Design system — FHG Funds" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DevComponentsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-card">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

function DevComponentsPage() {
  return (
    <div className="min-h-screen bg-gradient-soft p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Design system</h1>
          <p className="text-sm text-muted-foreground">
            All primitives in one place. Use this when reviewing dark mode, spacing, and tone.
          </p>
        </header>

        <Section title="Buttons">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </Section>

        <Section title="Inputs">
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="dev-text">Text</Label>
              <Input id="dev-text" placeholder="Type something" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dev-select">Select</Label>
              <Select>
                <SelectTrigger id="dev-select"><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">Option A</SelectItem>
                  <SelectItem value="b">Option B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="dev-area">Textarea</Label>
              <Textarea id="dev-area" placeholder="Long form" />
            </div>
          </div>
        </Section>

        <Section title="Badges">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </Section>

        <Section title="Cards">
          <Card className="w-72">
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>Short description copy.</CardDescription>
            </CardHeader>
            <CardContent>Body content with spacing.</CardContent>
          </Card>
          <StatCard label="Members" value="42" icon={Users} />
          <StatCard label="Funds" value="$1,234" icon={Wallet} hint="Across team" />
        </Section>

        <Section title="Skeletons">
          <div className="w-72 space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        </Section>

        <Section title="Status tones">
          <span className="rounded-md bg-success/10 px-3 py-1 text-sm text-success">success</span>
          <span className="rounded-md bg-warning/10 px-3 py-1 text-sm text-warning">warning</span>
          <span className="rounded-md bg-destructive/10 px-3 py-1 text-sm text-destructive">destructive</span>
          <span className="rounded-md bg-muted px-3 py-1 text-sm text-muted-foreground">muted</span>
        </Section>
      </div>
    </div>
  );
}
