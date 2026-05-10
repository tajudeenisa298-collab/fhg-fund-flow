import type { ComponentType, ReactNode } from "react";

export function StatCard({
  label,
  value,
  valueNode,
  hint,
  icon: Icon,
}: {
  label: string;
  value?: string;
  valueNode?: ReactNode;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex size-9 items-center justify-center rounded-lg bg-accent">
          <Icon className="size-4 text-accent-foreground" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">
        {valueNode ?? value}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
