import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Wraps a dashboard section so a render error in one section doesn't blow up
 * the whole page. Surfaces the actual error message inline so we can diagnose.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SectionErrorBoundary:${this.props.name}]`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
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
            <Button size="sm" variant="outline" className="mt-3" onClick={this.reset}>
              Try again
            </Button>
          </div>
        </div>
      </section>
    );
  }
}
