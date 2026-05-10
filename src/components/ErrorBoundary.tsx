import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    // @ts-ignore
    this.setState({ hasError: false, error: null });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      // @ts-ignore
      if (this.props.fallback) {
        // @ts-ignore
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-black/40 backdrop-blur-md rounded-3xl border border-red-500/30 max-w-sm mx-auto shadow-2xl pointer-events-auto">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
            <AlertTriangle className="text-red-400 w-8 h-8" />
          </div>
          <h2 className="text-xl font-medium text-white mb-2">System Glitch</h2>
          <p className="text-white/60 mb-6 text-sm">
            Golu's visualizer encountered an unexpected error.
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-full transition-colors font-medium border border-red-500/30"
          >
            <RefreshCcw size={16} />
            Reboot Interface
          </button>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}
