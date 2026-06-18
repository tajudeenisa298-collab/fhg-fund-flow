import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/* -------------------------------------------------------------------------- */
/*  Shared registry — lets boundaries dedupe & render one consolidated banner */
/* -------------------------------------------------------------------------- */

type ErrorEntry = { name: string; message: string };

interface RegistryCtx {
  report: (name: string, message: string) => void;
  clear: (name: string) => void;
  errors: ErrorEntry[];
}

const Ctx = createContext<RegistryCtx | null>(null);

export function SectionErrorProvider({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const report = useCallback((name: string, message: string) => {
    setErrors((prev) => {
      const without = prev.filter((e) => e.name !== name);
      return [...without, { name, message }];
    });
  }, []);
  const clear = useCallback((name: string) => {
    setErrors((prev) => prev.filter((e) => e.name !== name));
  }, []);
  const value = useMemo(() => ({ report, clear, errors }), [report, clear, errors]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Top-of-region banner: only renders when ≥2 sections share the same error. */
export function SectionErrorSummary() {
  const ctx = useContext(Ctx);
  if (!ctx || ctx.errors.length < 2) return null;
  // Group by message
  const groups = new Map<string, string[]>();
  for (const e of ctx.errors) {
    const list = groups.get(e.message) ?? [];
    list.push(e.name);
    groups.set(e.message, list);
  }
  const shared = Array.from(groups.entries()).filter(([, names]) => names.length >= 2);
  if (shared.length === 0) return null;
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 shadow-card">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-destructive">
            Multiple sections failed with the same error
          </p>
          {shared.map(([msg, names]) => (
            <div key={msg} className="text-xs text-muted-foreground">
              <p className="break-words font-medium text-foreground">{msg}</p>
              <p className="mt-0.5">Affects: {names.join(", ")}</p>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Likely a shared cause (permissions, network, or backend). Fixing the root
            will clear all of them.
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Boundary                                                                  */
/* -------------------------------------------------------------------------- */

interface Props {
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  retryLockUntil: number;
}

class BoundaryImpl extends Component<
  Props & { registry: RegistryCtx | null },
  State
> {
  state: State = { error: null, retryLockUntil: 0 };
  private tickTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SectionErrorBoundary:${this.props.name}]`, error, info.componentStack);
    this.props.registry?.report(this.props.name, error.message || String(error));
  }

  componentDidUpdate(_: unknown, prev: State) {
    if (prev.error && !this.state.error) {
      this.props.registry?.clear(this.props.name);
    }
  }

  componentWillUnmount() {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.props.registry?.clear(this.props.name);
  }

  reset = () => {
    if (Date.now() < this.state.retryLockUntil) return;
    this.setState({ error: null, retryLockUntil: Date.now() + 1500 });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const locked = Date.now() < this.state.retryLockUntil;
    if (locked && !this.tickTimer) {
      this.tickTimer = setTimeout(() => {
        this.tickTimer = null;
        this.forceUpdate();
      }, this.state.retryLockUntil - Date.now());
    }
    return (
      <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 shadow-card">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">
              "{this.props.name}" couldn't load
            </p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {this.state.error.message || String(this.state.error)}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={this.reset}
              disabled={locked}
            >
              {locked ? "Retrying…" : "Try again"}
            </Button>
          </div>
        </div>
      </section>
    );
  }
}

export function SectionErrorBoundary(props: Props) {
  const registry = useContext(Ctx);
  // Cleanup on unmount of the wrapper (covers Strict Mode remounts cleanly).
  useEffect(() => () => registry?.clear(props.name), [registry, props.name]);
  return <BoundaryImpl {...props} registry={registry} />;
}
