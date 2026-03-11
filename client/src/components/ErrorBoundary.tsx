import { Component, type ReactNode } from "react";
import { Shield } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string | null }) {
    console.error("[ErrorBoundary] Caught unhandled error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearAndRetry = () => {
    try {
      localStorage.clear();
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white" data-testid="error-boundary-fallback">
          <div className="text-center max-w-md px-6">
            <div className="flex items-center justify-center gap-2 mb-6">
              <div
                className="w-10 h-10 rounded-md flex items-center justify-center"
                style={{ backgroundColor: "#1e3a5f" }}
              >
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold" style={{ color: "#1e3a5f" }}>
                Signalum
              </span>
            </div>

            <h1
              className="text-2xl font-semibold mb-3"
              style={{ color: "#1e3a5f" }}
              data-testid="text-error-heading"
            >
              Something went wrong
            </h1>

            <p className="text-gray-500 mb-8" data-testid="text-error-subtext">
              We hit an unexpected error. Your data is safe.
            </p>

            <button
              onClick={this.handleReload}
              className="w-full text-white font-medium py-3 px-6 rounded-lg mb-4 transition-colors"
              style={{ backgroundColor: "#1e3a5f" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              data-testid="button-reload-workspace"
            >
              Reload workspace
            </button>

            <button
              onClick={this.handleClearAndRetry}
              className="text-sm text-gray-400 hover:text-gray-600 underline transition-colors"
              data-testid="link-clear-and-retry"
            >
              Clear and retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
