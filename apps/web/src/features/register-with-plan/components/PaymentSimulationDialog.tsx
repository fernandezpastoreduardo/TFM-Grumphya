import { useEffect, useRef, type SyntheticEvent } from "react";
import styles from "./PaymentSimulationDialog.module.scss";

const SIMULATION_DURATION_MS = 5_000;
const SIMULATION_NOTICE =
  "¿Parece que estoy haciéndo algo, eh? Pues efectivamente, no estoy haciendo nada, el pago es simulado y no se te cobrará nada.";

type PaymentSimulationDialogProps = {
  open: boolean;
  onComplete: () => void;
};

export function PaymentSimulationDialog({
  open,
  onComplete,
}: PaymentSimulationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const completionTimer = window.setTimeout(
      () => onCompleteRef.current(),
      SIMULATION_DURATION_MS,
    );
    return () => window.clearTimeout(completionTimer);
  }, [open]);

  function keepSimulationOpen(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="payment-simulation-title"
      aria-describedby="payment-simulation-notice"
      onCancel={keepSimulationOpen}
    >
      <section className={styles.panel}>
        <span className={styles.eyebrow}>Contratación simulada</span>
        <div className={styles.spinner} aria-hidden="true" />
        <h2 id="payment-simulation-title">
          Un momento. Estoy preparando tu cuenta.
        </h2>
        <p
          id="payment-simulation-notice"
          className={styles.notice}
          role="status"
          aria-live="polite"
        >
          {SIMULATION_NOTICE}
        </p>
      </section>
    </dialog>
  );
}
