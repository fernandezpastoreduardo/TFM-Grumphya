import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import styles from "./EvaluationDialog.module.scss";

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
          <section className={styles.loading} role="status" aria-live="polite">
            <span className={styles.mascot} aria-hidden="true" />
            <div>
              <h2>Buscando dónde puede romperse…</h2>
              <p>Evaluando tu idea. La espera no mejora el resultado.</p>
            </div>
          </section>
        ) : null}
        {children}
      </div>
    </dialog>
  );
}
