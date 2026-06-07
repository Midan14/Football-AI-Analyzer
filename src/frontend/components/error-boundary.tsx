"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    const isChunkLoad =
      error.name === "ChunkLoadError" ||
      /Failed to load chunk|Loading chunk \d+ failed/i.test(error.message);
    if (isChunkLoad && typeof window !== "undefined") {
      const key = "football-ai-chunk-reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>⚠️ Algo salió mal</h2>
            <p>
              {this.state.error?.name === "ChunkLoadError" ||
              /Failed to load chunk/i.test(this.state.error?.message ?? "")
                ? "La caché del navegador quedó desactualizada tras un reinicio del servidor. Recarga la página (Cmd+Shift+R)."
                : "Ocurrió un error inesperado en la aplicación."}
            </p>
            {this.state.error && (
              <pre className="error-details">{this.state.error.message}</pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.reload();
              }}
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
