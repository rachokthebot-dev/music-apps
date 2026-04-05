"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-center">
          <p className="text-sm font-medium text-destructive mb-1">Something went wrong</p>
          <p className="text-xs text-muted-foreground mb-3">{this.state.error?.message}</p>
          <button
            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
