import { Component, type ReactNode } from "react";
import { SectionPageFrame } from "../../shared/components/section-page-frame";
import styles from "./error-pages.module.scss";

export type ErrorPageStatus = "404" | "429" | "500";

type ErrorCopy = {
  label: string;
  headline: string;
  description: string;
  scene: string;
  primary: string;
  secondary?: string;
};

const ERROR_COPY: Record<ErrorPageStatus, ErrorCopy> = {
  "404": {
    label: "Ruta perdida",
    headline: "Por aquí no hay ninguna sección.",
    description: "La dirección se ha inventado el destino.",
    scene: styles.scene404,
    primary: "Volver al inicio",
    secondary: "Volver atrás",
  },
  "429": {
    label: "Límite temporal",
    headline:
      "Ya está, te las has ingeniado para que incluso un servidor te pida que te calles un rato.",
    description: "Hemos frenado temporalmente las solicitudes. {{detail}}",
    scene: styles.scene429,
    primary: "Entendido",
  },
  "500": {
    label: "Fallo del servidor",
    headline: "Algo se ha torcido por aquí.",
    description: "No se ha guardado ninguna evaluación incompleta.",
    scene: styles.scene500,
    primary: "Volver al inicio",
    secondary: "Reintentar",
  },
};

const ERROR_FRAME = {
  label: "Una interrupción en la función",
  title: "Un error. Una salida.",
  intro: "La página no está disponible como debería.",
  theme: "mint",
} as const;
const DEFAULT_RATE_LIMIT_DETAIL =
  "El servidor ha frenado temporalmente las solicitudes. Vuelve a intentarlo más tarde.";

function renderDescription(
  status: ErrorPageStatus,
  detail: string | undefined,
) {
  if (status !== "429") return ERROR_COPY[status].description;
  return detail?.trim() || DEFAULT_RATE_LIMIT_DETAIL;
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.assign("/");
}

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
          className={`${styles.errorStage} ${copy.scene}`}
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
