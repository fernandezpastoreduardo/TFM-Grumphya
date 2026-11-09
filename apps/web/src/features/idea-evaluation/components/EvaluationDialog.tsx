import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import styles from "./EvaluationDialog.module.scss";

const LOADING_STAGE_INTERVAL_MS = 2_800;
const LOADING_STAGES = [
  "Descartando graciosillos…",
  "Consultando si a alguien más se le ha ocurrido tu idea…",
  "Evaluando tu idea con el DEBIDO respeto…",
] as const;

type EvaluationDialogProps = {
  open: boolean;
  isEvaluating: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function EvaluationDialog({
  open,
  isEvaluating,
  onClose,
  children,
}: EvaluationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);

  useEffect(() => {
    if (!isEvaluating) {
      setLoadingStageIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setLoadingStageIndex((currentIndex) =>
        Math.min(currentIndex + 1, LOADING_STAGES.length - 1),
      );
    }, LOADING_STAGE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isEvaluating]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        // jsdom does not implement showModal; browsers always use the top layer.
        dialog.setAttribute("open", "");
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="evaluation-dialog-title"
      aria-busy={isEvaluating}
      onClose={onClose}
      onClick={handleDialogClick}
    >
      <div className={styles.panel}>
        <h2 className="sr-only" id="evaluation-dialog-title">
          Resultado de la evaluación
        </h2>
        <button
          className={styles.close}
          type="button"
          aria-label="Cerrar resultado"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
          <span>Cerrar</span>
        </button>
        {isEvaluating ? (
          <section className={styles.loading}>
            <span className={styles.mascot} aria-hidden="true" />
            <div>
              <h2>Buscando dónde puede romperse…</h2>
              <p>Evaluando tu idea. La espera no mejora el resultado.</p>
              <p
                className={styles.loadingStage}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {LOADING_STAGES[loadingStageIndex]}
              </p>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label="Progreso de la evaluación"
              >
                <span className={styles.progressBar} aria-hidden="true" />
              </div>
            </div>
          </section>
        ) : null}
        {children}
      </div>
    </dialog>
  );
}
