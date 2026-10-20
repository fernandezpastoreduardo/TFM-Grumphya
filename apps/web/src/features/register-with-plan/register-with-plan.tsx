import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import "../../shared/styles/account.scss";
import "./register-with-plan.scss";

type Plan = "ILUMINADO" | "FALTON";
type PlanResponse = { plan: Plan };
type RegistrationField =
  "email" | "username" | "password" | "privacyPolicyAcknowledged";

const EMAIL_ERROR = "Venga ya, ese correo no es de verdad, escribe bien anda.";
const USERNAME_ERROR =
  "Ese nombre necesita al menos 3 caracteres. Prueba con otro.";
const PASSWORD_ERROR = "La contraseña necesita al menos 12 caracteres.";
const STRONG_PASSWORD_ERROR =
  "Usa al menos 12 caracteres e incluye mayúscula, minúscula, número y carácter especial.";
const PRIVACY_ERROR =
  "Debes confirmar que has leído la política de privacidad.";
const GENERIC_ERROR =
  "No se ha podido completar el alta. Para evitar duplicados, vuelve a cargar la página antes de intentarlo otra vez.";
const PENDING_COPY =
  "Si el correo puede usarse, recibirás un enlace para verificarlo. No se activa la cuenta ni el plan hasta que confirmes el correo y la contratación simulada.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN =
  /^[\p{L}\p{N}](?:[\p{L}\p{N}]|[._-](?=[\p{L}\p{N}])){1,28}[\p{L}\p{N}]$/u;
const PASSWORD_UPPERCASE_PATTERN = /\p{Lu}/u;
const PASSWORD_LOWERCASE_PATTERN = /\p{Ll}/u;
const PASSWORD_NUMBER_PATTERN = /\p{N}/u;
const PASSWORD_SPECIAL_PATTERN = /[^\p{L}\p{N}\s]/u;
const PLAN_NAMES: Record<Plan, string> = {
  ILUMINADO: "Iluminado",
  FALTON: "Faltón",
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isPlanResponse(value: unknown): value is PlanResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "plan" in value &&
    (value.plan === "ILUMINADO" || value.plan === "FALTON")
  );
}

function isRegistrationPendingResponse(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "verification_pending"
  );
}

export function RegisterWithPlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const submissionLocked = useRef(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<RegistrationField | null>(null);

  useEffect(() => {
    let active = true;
    async function loadPlan() {
      try {
        const response = await fetch("/api/registration-intents/current", {
          credentials: "same-origin",
        });
        const body: unknown = await readJson(response);
        if (active && response.ok && isPlanResponse(body)) setPlan(body.plan);
      } catch {
        if (active) setPlan(null);
      } finally {
        if (active) setLoadingPlan(false);
      }
    }
    void loadPlan();
    return () => {
      active = false;
    };
  }, []);

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLocked.current || submitted) return;
    setError("");
    setErrorField(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const privacyPolicyAcknowledged =
      formData.get("privacyPolicyAcknowledged") === "on";

    if (!EMAIL_PATTERN.test(email)) {
      setError(EMAIL_ERROR);
      setErrorField("email");
      return;
    }
    if (!USERNAME_PATTERN.test(username.normalize("NFC"))) {
      setError(USERNAME_ERROR);
      setErrorField("username");
      return;
    }
    if (!isStrongPassword(password)) {
      setError(password.length < 12 ? PASSWORD_ERROR : STRONG_PASSWORD_ERROR);
      setErrorField("password");
      return;
    }
    if (!privacyPolicyAcknowledged) {
      setError(PRIVACY_ERROR);
      setErrorField("privacyPolicyAcknowledged");
      return;
    }

    submissionLocked.current = true;
    setSubmitted(true);
    setSubmitting(true);
    try {
      const response = await fetch("/api/registrations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username,
          password,
          privacyPolicyAcknowledged: true,
        }),
      });
      const body: unknown = await readJson(response);
      if (response.ok && isRegistrationPendingResponse(body)) {
        setRegisteredEmail(email);
        setVerificationPending(true);
        return;
      }
      const responseMessage =
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof body.message === "string"
          ? body.message
          : GENERIC_ERROR;
      setError(responseMessage);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    if (resending || !registeredEmail) return;
    setResending(true);
    setResendMessage("");
    try {
      const response = await fetch("/api/registrations/resend-verification", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: registeredEmail }),
      });
      const body: unknown = await readJson(response);
      if (response.ok && isRegistrationPendingResponse(body)) {
        setResendMessage(
          "Si hay una verificación pendiente para ese correo, enviaremos otro enlace cuando sea posible.",
        );
      } else {
        setResendMessage(GENERIC_ERROR);
      }
    } catch {
      setResendMessage(GENERIC_ERROR);
    } finally {
      setResending(false);
    }
  }

  if (loadingPlan) {
    return (
      <LoadingSkeleton
        label="Comprobando el plan seleccionado"
        className="registration-skeleton"
      >
        <div className="content-card auth-card registration-skeleton-form">
          <SkeletonBlock className="skeleton-registration-label" />
          <SkeletonBlock className="skeleton-registration-title" />
          {Array.from({ length: 3 }, (_, index) => (
            <div className="registration-skeleton-field" key={index}>
              <SkeletonBlock className="skeleton-registration-label" />
              <SkeletonBlock className="skeleton-registration-input" />
            </div>
          ))}
          <SkeletonBlock className="skeleton-registration-button" />
        </div>
      </LoadingSkeleton>
    );
  }
  if (plan === null) {
    return (
      <section
        className="content-card account-plan-required"
        aria-labelledby="plan-required-title"
      >
        <span className="eyebrow">Primero, una decisión</span>
        <h2 id="plan-required-title">
          Elige un plan antes de crear la cuenta.
        </h2>
        <p>
          El alta solo está disponible al seleccionar Iluminado o Faltón. El
          plan gratis no necesita registro.
        </p>
        <a className="button-primary" href="/precios">
          Ver los planes <span aria-hidden="true">↗</span>
        </a>
      </section>
    );
  }
  if (verificationPending) {
    return (
      <section
        className="content-card registration-pending"
        aria-labelledby="registration-pending-title"
      >
        <span className="eyebrow">Un paso más</span>
        <h2 id="registration-pending-title">Revisa tu correo</h2>
        <p role="status">{PENDING_COPY}</p>
        <button
          className="button-primary"
          type="button"
          onClick={() => void resendVerification()}
          disabled={resending}
        >
          {resending ? "Solicitando…" : "Solicitar otro enlace"}
        </button>
        {resendMessage ? <p role="status">{resendMessage}</p> : null}
      </section>
    );
  }
  return (
    <>
      <div className="auth-layout">
        <section
          className="content-card auth-card"
          aria-labelledby="registration-title"
        >
          <span className="eyebrow">Plan seleccionado: {PLAN_NAMES[plan]}</span>
          <h2 id="registration-title">Vamos a ponerle nombre a la cuenta</h2>
          <form
            className="registration-form"
            onSubmit={submitRegistration}
            noValidate
            aria-busy={submitting}
          >
            <div className="registration-field">
              <label htmlFor="registration-email">Correo electrónico</label>
              <input
                id="registration-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={errorField === "email"}
                aria-describedby={
                  errorField === "email" ? "registration-error" : undefined
                }
              />
            </div>
            <div className="registration-field">
              <label htmlFor="registration-username">Nombre de usuario</label>
              <input
                id="registration-username"
                name="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={30}
                aria-invalid={errorField === "username"}
                aria-describedby={
                  errorField === "username" ? "registration-error" : undefined
                }
              />
            </div>
            <div className="registration-field">
              <label htmlFor="registration-password">Contraseña</label>
              <input
                id="registration-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                aria-describedby={
                  errorField === "password"
                    ? "registration-error registration-password-help"
                    : "registration-password-help"
                }
                aria-invalid={errorField === "password"}
              />
              <p id="registration-password-help">
                Mínimo 12 caracteres, con mayúscula, minúscula, número y
                carácter especial.
              </p>
            </div>
            <label
              className="registration-privacy"
              htmlFor="privacy-policy-acknowledged"
            >
              <input
                id="privacy-policy-acknowledged"
                name="privacyPolicyAcknowledged"
                type="checkbox"
                required
                aria-invalid={errorField === "privacyPolicyAcknowledged"}
                aria-describedby={
                  errorField === "privacyPolicyAcknowledged"
                    ? "registration-error"
                    : undefined
                }
              />
              <span>
                He leído la{" "}
                <a href="/politica-de-privacidad">política de privacidad</a>.{" "}
                <span className="registration-terms-link">
                  Consulta también los{" "}
                  <a href="/terminos-y-condiciones">términos y condiciones</a>.
                </span>
              </span>
            </label>
            {error ? (
              <p
                className="registration-error"
                id="registration-error"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <button
              className="button-primary"
              type="submit"
              disabled={submitting || submitted}
            >
              {submitting
                ? "Dándote de alta…"
                : submitted
                  ? "Alta enviada"
                  : "Crear cuenta y verificar correo"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="auth-privacy">{PENDING_COPY}</p>
        </section>
        <aside className="auth-aside">
          <div
            className="auth-creature auth-creature-register"
            aria-hidden="true"
          />
          <h2>Un mes. Sin renovaciones automáticas.</h2>
          <p>
            Si quieres otro, vuelves a contratar. No tendrás que cancelar nada;
            aquí no ponemos trampas de calendario.
          </p>
        </aside>
      </div>
    </>
  );
}

function isStrongPassword(password: string): boolean {
  if (password.length < 12 || password.length > 128) return false;
  return (
    PASSWORD_UPPERCASE_PATTERN.test(password) &&
    PASSWORD_LOWERCASE_PATTERN.test(password) &&
    PASSWORD_NUMBER_PATTERN.test(password) &&
    PASSWORD_SPECIAL_PATTERN.test(password)
  );
}
