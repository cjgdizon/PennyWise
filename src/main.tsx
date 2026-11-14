import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return (
        <main className="mx-auto my-16 max-w-xl space-y-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-8">
          <h1 className="text-2xl font-semibold">Your records could not be opened.</h1>
          <p role="alert" className="text-rose-700 dark:text-rose-300">{this.state.error}</p>
          <p className="text-sm leading-6 text-[var(--muted)]">
            Keep this browser's data intact. Close other PennyWise tabs and
            retry. Do not clear storage to fix this error.
          </p>
          <button className="min-h-11 rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white" onClick={() => location.reload()}>Retry</button>
        </main>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
