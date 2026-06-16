import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Renders children directly on md+ screens.
 * On mobile, collapses into a button-toggled section to reduce dashboard density.
 */
export function MobileCollapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-2xl border bg-card px-4 py-3 text-left shadow-card"
          aria-expanded={open}
        >
          <span className="text-sm font-semibold">{title}</span>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && <div className="mt-3">{children}</div>}
      </div>
      <div className="hidden md:block">{children}</div>
    </>
  );
}
