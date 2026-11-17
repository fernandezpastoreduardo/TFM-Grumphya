import { useEffect, useRef, type SyntheticEvent } from "react";
import {
  SIMULATION_DURATION_MS,
  SIMULATION_NOTICE,
} from "./payment-simulation.constants";
import type { PaymentSimulationDialogProps } from "./payment-simulation.models";
import styles from "./PaymentSimulationDialog.module.scss";

export function PaymentSimulationDialog({
  open,
  onComplete,
  heading = "Un momento. Estoy preparando tu cuenta.",
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
        <h2 id="payment-simulation-title">{heading}</h2>
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
