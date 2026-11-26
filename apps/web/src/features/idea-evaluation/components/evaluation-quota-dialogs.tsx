import { lazy, Suspense, useEffect, useRef } from "react";

const UsageLimitDialog = lazy(() =>
  import("../../../shared/components/usage-limit-dialog").then((module) => ({
    default: module.UsageLimitDialog,
  })),
);
const EmailVerificationRequiredDialog = lazy(() =>
  import("../../../shared/components/email-verification-required-dialog").then(
    (module) => ({ default: module.EmailVerificationRequiredDialog }),
  ),
);

type EvaluationQuotaDialogsProps = {
  isQuotaDialogOpen: boolean;
  isDailyQuotaDialogOpen: boolean;
  isEmailVerificationDialogOpen: boolean;
  onQuotaDialogClose: () => void;
  onDailyQuotaDialogClose: () => void;
  onEmailVerificationDialogClose: () => void;
};

export function EvaluationQuotaDialogs({
  isQuotaDialogOpen,
  isDailyQuotaDialogOpen,
  isEmailVerificationDialogOpen,
  onQuotaDialogClose,
  onDailyQuotaDialogClose,
  onEmailVerificationDialogClose,
}: EvaluationQuotaDialogsProps) {
  const quotaDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = quotaDialogRef.current;
    if (!dialog) return;
    if (isQuotaDialogOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!isQuotaDialogOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [isQuotaDialogOpen]);

  return (
    <>
      {isEmailVerificationDialogOpen ? (
        <Suspense fallback={null}>
          <EmailVerificationRequiredDialog
            open
            onClose={onEmailVerificationDialogClose}
          />
        </Suspense>
      ) : null}
      {isQuotaDialogOpen ? (
        <dialog
          ref={quotaDialogRef}
          className="quota-exhausted-dialog"
          aria-labelledby="quota-exhausted-title"
          aria-describedby="quota-exhausted-copy"
          onClose={onQuotaDialogClose}
        >
          <button
            className="quota-dialog-close"
            type="button"
            aria-label="Cerrar aviso de usos gratuitos agotados"
            onClick={onQuotaDialogClose}
          >
            ×
          </button>
          <img
            src="/assets/grumphya/mascot-crossed-arms.webp"
            alt="Grumphya esperando un café"
          />
          <span className="eyebrow">El café se ha terminado</span>
          <h2 id="quota-exhausted-title">Ya conoces el método</h2>
          <p id="quota-exhausted-copy">
            Ahora que sabes cómo va la app, te cuento el detalle: funciono a
            base de café. Tus tres pruebas gratis ya se han agotado. No se
            reinician: cada navegador tiene tres evaluaciones de por vida.
          </p>
          <a className="button-primary" href="/precios">
            A ver lo que cuesta un café <span aria-hidden="true">↗</span>
          </a>
        </dialog>
      ) : null}
      {isDailyQuotaDialogOpen ? (
        <Suspense fallback={null}>
          <UsageLimitDialog
            open
            scope="ideas"
            onClose={onDailyQuotaDialogClose}
          />
        </Suspense>
      ) : null}
    </>
  );
}
