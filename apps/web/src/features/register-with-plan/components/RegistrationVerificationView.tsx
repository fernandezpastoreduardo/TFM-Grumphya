import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../../shared/components/loading-skeleton";
import {
  CONFIRMATION_ERROR,
  GENERIC_VERIFICATION_ERROR,
  PLAN_NAMES,
} from "../registration-verification.constants";
import type {
  Plan,
  VerificationStatus,
} from "../registration-verification.models";
import "../../../shared/styles/account.scss";

type RegistrationVerificationViewProps = {
  status: VerificationStatus;
  plan: Plan | null;
  resendEmail: string;
  resending: boolean;
  resendMessage: string;
  onResendEmailChange: (email: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onConfirm: () => void;
};

export function RegistrationVerificationView({
  status,
  plan,
  resendEmail,
  resending,
  resendMessage,
  onResendEmailChange,
  onVerify,
  onResend,
  onConfirm,
}: RegistrationVerificationViewProps) {
  if (status === "checking") {
    return (
      <LoadingSkeleton
        label="Verificando el enlace de correo"
        className="verification-skeleton"
      >
        <div className="content-card registration-pending">
          <SkeletonBlock className="skeleton-registration-label" />
          <SkeletonBlock className="skeleton-registration-title" />
          <SkeletonBlock className="skeleton-verification-copy" />
          <SkeletonBlock className="skeleton-registration-button" />
        </div>
      </LoadingSkeleton>
    );
  }
  if (status === "ready" || status === "verifying") {
    return (
      <section
        className="content-card registration-pending"
        aria-labelledby="verify-email-title"
      >
        <span className="eyebrow">Un último paso</span>
        <h2 id="verify-email-title">Confirma tu correo</h2>
        <p>Confirma que has solicitado crear esta cuenta para continuar.</p>
        <button
          className="button-primary"
          type="button"
          onClick={onVerify}
          disabled={status === "verifying"}
        >
          {status === "verifying" ? "Verificando…" : "Confirmar correo"}
        </button>
      </section>
    );
  }
  if (status === "verification_error") {
    return (
      <section
        className="content-card registration-pending"
        aria-labelledby="verification-error-title"
      >
        <span className="eyebrow">Verificación no completada</span>
        <h2 id="verification-error-title">
          No se ha podido verificar el correo
        </h2>
        <p role="alert">{GENERIC_VERIFICATION_ERROR}</p>
        <form
          className="registration-resend-form"
          onSubmit={(event) => {
            event.preventDefault();
            onResend();
          }}
        >
          <label htmlFor="verification-resend-email">
            Correo electrónico usado en el alta
          </label>
          <input
            id="verification-resend-email"
            type="email"
            autoComplete="email"
            required
            value={resendEmail}
            onChange={(event) => onResendEmailChange(event.currentTarget.value)}
          />
          <button className="button-primary" type="submit" disabled={resending}>
            {resending ? "Solicitando…" : "Solicitar otro enlace"}
          </button>
          {resendMessage ? <p role="status">{resendMessage}</p> : null}
        </form>
        <a className="button-primary" href="/precios">
          Volver a los planes
        </a>
      </section>
    );
  }
  if (
    status === "verified" ||
    status === "confirming" ||
    status === "confirmation_error"
  ) {
    return (
      <section
        className="content-card registration-pending"
        aria-labelledby="email-verified-title"
      >
        <span className="eyebrow">Correo verificado</span>
        <h2 id="email-verified-title">Correo verificado</h2>
        <p>
          Has verificado el correo. Tu plan {plan ? PLAN_NAMES[plan] : ""}{" "}
          todavía no está activo.
        </p>
        {status === "confirmation_error" ? (
          <p role="alert">{CONFIRMATION_ERROR}</p>
        ) : null}
        {status === "confirming" ? (
          <p role="status">Confirmando la contratación simulada…</p>
        ) : null}
        <button
          className="button-primary"
          type="button"
          onClick={onConfirm}
          disabled={status === "confirming"}
        >
          {status === "confirming"
            ? "Confirmando…"
            : status === "confirmation_error"
              ? "Reintentar confirmación"
              : "Confirmar contratación simulada"}
        </button>
      </section>
    );
  }
  return (
    <section
      className="content-card registration-pending"
      aria-labelledby="registration-complete-title"
    >
      <span className="eyebrow">Contratación simulada completada</span>
      <h2 id="registration-complete-title">Contratación simulada completada</h2>
      <p role="status">
        El plan {plan ? PLAN_NAMES[plan] : ""} está activo en el servidor. No se
        ha procesado ningún pago.
      </p>
      <a className="button-primary" href="/">
        Volver al inicio
      </a>
    </section>
  );
}
