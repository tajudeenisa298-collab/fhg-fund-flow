import { Skeleton } from "@/components/ui/skeleton";

export function DashboardBootSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-soft p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="size-10 rounded-xl" />
          </div>
        </div>
        <StatsSkeleton count={4} />
        <SectionSkeleton rows={5} />
      </div>
    </div>
  );
}

export function DashboardViewSkeleton({ section }: { section?: string }) {
  if (section === "team") {
    return (
      <div className="space-y-6">
        <SectionHeaderSkeleton />
        <TableSkeleton rows={6} />
      </div>
    );
  }
  if (section === "money") {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={3} />
        <SectionSkeleton rows={4} />
        <TableSkeleton rows={5} />
      </div>
    );
  }
  if (section === "admin") {
    return (
      <div className="space-y-6">
        <SectionSkeleton rows={3} />
        <SectionSkeleton rows={4} />
        <SectionSkeleton rows={3} />
      </div>
    );
  }
  if (section === "structure") {
    return <TreeSkeleton />;
  }
  return (
    <div className="space-y-6">
      <SectionHeaderSkeleton />
      <StatsSkeleton count={6} />
      <SectionSkeleton rows={4} />
    </div>
  );
}

export function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 rounded-xl border p-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <SectionHeaderSkeleton compact />
      <div className="mt-4 overflow-hidden rounded-xl border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
            <Skeleton className="size-8 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-6 shadow-card">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="size-9 rounded-lg" />
          </div>
          <Skeleton className="mt-4 h-8 w-32" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

function SectionHeaderSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "space-y-2" : "flex items-end justify-between gap-3"}>
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      {!compact && <Skeleton className="h-9 w-32 rounded-lg" />}
    </div>
  );
}

function TreeSkeleton() {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <SectionHeaderSkeleton />
      <div className="mt-8 flex flex-col items-center gap-5">
        <Skeleton className="h-20 w-64 rounded-2xl" />
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    </section>
  );
}
