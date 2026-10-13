import { useEffect, useState, type FormEvent } from "react";

type Plan = "ILUMINADO" | "FALTON";
type PlanResponse = { plan: Plan };
type RegistrationResponse = {
  status: "pending_email_verification";
  message: string;
};
type RegistrationField = "email" | "username" | "password" | "privacyPolicyAcknowledged";

const EMAIL_ERROR = "Venga ya, ese correo no es de verdad, escribe bien anda.";
const USERNAME_ERROR = "Ese nombre necesita al menos 3 caracteres. Prueba con otro.";
const PASSWORD_ERROR = "La contraseña necesita al menos 12 caracteres.";
const PRIVACY_ERROR = "Debes confirmar que has leído la política de privacidad.";
const GENERIC_ERROR =
  "No se ha podido completar el alta. Revisa los datos e inténtalo de nuevo.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}]|[._-](?=[\p{L}\p{N}])){1,28}[\p{L}\p{N}]$/u;
const QA_MAILBOX = "fernandezpastoreduardo@gmail.com";
const TEST_MAIL_ERROR = "No se ha podido abrir el enlace de pruebas. Comprueba que la API local esté activa e inténtalo otra vez.";
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

function isRegistrationResponse(value: unknown): value is RegistrationResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "pending_email_verification" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

function isVerificationLink(value: unknown): value is { verificationUrl: string } {
  return typeof value === "object" && value !== null && "verificationUrl" in value && typeof value.verificationUrl === "string";
}

export function RegisterWithPlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<RegistrationField | null>(null);
  const [pendingMessage, setPendingMessage] = useState("");
  const [openingVerification, setOpeningVerification] = useState(false);
  const [testMailError, setTestMailError] = useState("");

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
    setError("");
    setErrorField(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const privacyPolicyAcknowledged = formData.get("privacyPolicyAcknowledged") === "on";

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
    if (password.length < 12) {
      setError(PASSWORD_ERROR);
      setErrorField("password");
      return;
    }
    if (!privacyPolicyAcknowledged) {
      setError(PRIVACY_ERROR);
      setErrorField("privacyPolicyAcknowledged");
      return;
    }

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
      if (response.status === 202 && isRegistrationResponse(body)) {
        setPendingMessage(body.message);
        return;
      }
      setError(GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  async function openTestVerification() {
    setOpeningVerification(true);
    setTestMailError("");
    try {
      const response = await fetch("/api/registration-test-mail/latest", { credentials: "same-origin" });
      const body: unknown = await readJson(response);
      if (!response.ok || !isVerificationLink(body)) {
        setTestMailError(TEST_MAIL_ERROR);
        return;
      }
      const url = new URL(body.verificationUrl, window.location.origin);
      if (url.pathname !== "/verificar-cuenta" || !/^[a-f0-9]{64}$/.test(url.hash.slice(1))) {
        setTestMailError(TEST_MAIL_ERROR);
        return;
      }
      window.location.assign(`${url.pathname}${url.hash}`);
    } catch {
      setTestMailError(TEST_MAIL_ERROR);
    } finally {
      setOpeningVerification(false);
    }
  }

  if (loadingPlan) {
    return <p className="auth-notice" role="status">Comprobando el plan seleccionado…</p>;
  }
  if (plan === null) {
    return (
      <section className="content-card account-plan-required" aria-labelledby="plan-required-title">
        <span className="eyebrow">Primero, una decisión</span>
        <h2 id="plan-required-title">Elige un plan antes de crear la cuenta.</h2>
        <p>El alta solo está disponible al seleccionar Iluminado o Faltón. El plan gratis no necesita registro.</p>
        <a className="button-primary" href="/precios">Ver los planes <span aria-hidden="true">↗</span></a>
      </section>
    );
  }
  if (pendingMessage) {
    return (
      <section className="content-card registration-pending" aria-labelledby="registration-pending-title">
        <span className="eyebrow">Alta pendiente de verificación</span>
        <h2 id="registration-pending-title">Continúa con la verificación de prueba</h2>
        <p role="status">{pendingMessage}</p>
        <p className="registration-test-notice"><strong>Modo de pruebas:</strong> no se envía un correo real. El buzón QA configurado es {QA_MAILBOX}; puedes abrir el enlace generado localmente para verificar y después confirmar la contratación simulada.</p>
        {testMailError ? <p role="alert">{testMailError}</p> : null}
        <button className="button-primary" type="button" onClick={() => void openTestVerification()} disabled={openingVerification}>
          {openingVerification ? "Abriendo enlace…" : "Abrir enlace de verificación de pruebas"}
        </button>
        <p>La cuenta y el plan aún no están activos.</p>
      </section>
    );
  }

  return (
    <div className="auth-layout">
      <section className="content-card auth-card" aria-labelledby="registration-title">
        <span className="eyebrow">Plan seleccionado: {PLAN_NAMES[plan]}</span>
        <h2 id="registration-title">Vamos a ponerle nombre a la cuenta</h2>
        <p className="registration-test-notice"><strong>Modo de pruebas:</strong> no se envía un correo real. El buzón QA configurado es {QA_MAILBOX}, pero este prototipo solo genera un enlace local. No uses este flujo para una cuenta real.</p>
        <form onSubmit={submitRegistration} noValidate aria-busy={submitting}>
          <label htmlFor="registration-email">Correo electrónico</label>
          <input id="registration-email" name="email" type="email" autoComplete="email" required aria-invalid={errorField === "email"} aria-describedby={errorField === "email" ? "registration-error" : undefined} />
          <label htmlFor="registration-username">Nombre de usuario</label>
          <input id="registration-username" name="username" autoComplete="username" required minLength={3} maxLength={30} aria-invalid={errorField === "username"} aria-describedby={errorField === "username" ? "registration-error" : undefined} />
          <label htmlFor="registration-password">Contraseña</label>
          <input id="registration-password" name="password" type="password" autoComplete="new-password" required minLength={12} aria-invalid={errorField === "password"} aria-describedby={errorField === "password" ? "registration-error" : undefined} />
          <label className="registration-privacy" htmlFor="privacy-policy-acknowledged">
            <input id="privacy-policy-acknowledged" name="privacyPolicyAcknowledged" type="checkbox" required aria-invalid={errorField === "privacyPolicyAcknowledged"} aria-describedby={errorField === "privacyPolicyAcknowledged" ? "registration-error" : undefined} />
            <span>He leído la <a href="/politica-de-privacidad">política de privacidad</a>.</span>
          </label>
          {error ? <p className="registration-error" id="registration-error" role="alert">{error}</p> : null}
          <button className="button-primary" type="submit" disabled={submitting}>
            {submitting ? "Enviando…" : "Crear cuenta"} <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="auth-privacy">Cuando completes la verificación, podrás confirmar la contratación simulada. No se procesa ningún pago.</p>
      </section>
      <aside className="auth-aside">
        <div className="auth-creature" aria-hidden="true" />
        <h2>Tus ideas aprobadas son tuyas.</h2>
        <p>El servidor comprobará el plan seleccionado y solo lo activará al completar la verificación y la contratación simulada.</p>
      </aside>
    </div>
  );
}
