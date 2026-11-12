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
        <main className="recovery">
          <h1>Your records could not be opened.</h1>
          <p>{this.state.error}</p>
          <p>
            Keep this browser's data intact. Close other PennyWise tabs and
            retry. Do not clear storage to fix this error.
          </p>
          <button onClick={() => location.reload()}>Retry</button>
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
