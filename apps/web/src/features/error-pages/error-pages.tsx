import { Component, type ReactNode } from "react";
import { SectionPageFrame } from "../../shared/components/section-page-frame";
import { ERROR_COPY, ERROR_FRAME } from "./error-pages.constants";
import type { ErrorPageStatus } from "./error-pages.models";
import { goBack, renderDescription } from "./error-pages.utils";
import styles from "./error-pages.module.scss";

export type { ErrorPageStatus } from "./error-pages.models";

export function ErrorPages({
  status,
  detail,
  onRetry,
}: {
  status: ErrorPageStatus;
  detail?: string;
  onRetry?: () => void;
}) {
  const copy = ERROR_COPY[status];
  return (
    <SectionPageFrame page={ERROR_FRAME} showHero={false}>
      <section className={styles.errorPage} aria-labelledby="error-page-title">
        <div className={styles.errorCopy}>
          <span className={styles.errorKicker}>
            <span aria-hidden="true" />
            {copy.label}
          </span>
          <h1 className={styles.errorCode} id="error-page-title">
            {status}
          </h1>
          <h2 className={styles.errorHeadline}>{copy.headline}</h2>
          <p className={styles.errorDescription}>
            {renderDescription(status, detail)}
          </p>
          <div className={styles.errorActions}>
            <a className={styles.primaryAction} href="/">
              {copy.primary} <span aria-hidden="true">→</span>
            </a>
            {copy.secondary ? (
              <button
                className={styles.secondaryAction}
                type="button"
                onClick={
                  status === "500"
                    ? (onRetry ?? (() => window.location.reload()))
                    : goBack
                }
              >
                {copy.secondary}
              </button>
            ) : null}
          </div>
        </div>
        <div
          className={styles.errorStage + " " + copy.scene}
          aria-hidden="true"
        />
      </section>
    </SectionPageFrame>
  );
}

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { hasError: boolean };

export class ErrorPagesBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    console.error("UI_RENDER_FAILURE");
  }

  private retry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <ErrorPages status="500" onRetry={this.retry} />;
    }
    return this.props.children;
  }
}
