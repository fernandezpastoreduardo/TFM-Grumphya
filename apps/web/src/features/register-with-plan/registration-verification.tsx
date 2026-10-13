import { useEffect, useRef, useState } from "react";

type Plan = "ILUMINADO" | "FALTON";
type VerificationResponse = { status: "email_verified"; plan: Plan };
type ConfirmationResponse = { status: "active"; plan: Plan };
type VerificationStatus =
  | "checking"
  | "verified"
  | "confirming"
  | "confirmation_error"
  | "verification_error"
  | "success";

const GENERIC_VERIFICATION_ERROR =
  "No se ha podido verificar el correo. El enlace puede haber caducado o ya haberse utilizado. Solicita uno nuevo o vuelve a intentarlo.";
const CONFIRMATION_ERROR =
  "El correo ya está verificado, pero no se ha podido activar el plan. Puedes volver a intentarlo.";
const PLAN_NAMES: Record<Plan, string> = { ILUMINADO: "Iluminado", FALTON: "Faltón" };

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isPlan(value: unknown): value is Plan {
  return value === "ILUMINADO" || value === "FALTON";
}

function isVerificationResponse(value: unknown): value is VerificationResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "email_verified" &&
    "plan" in value &&
    isPlan(value.plan)
  );
}

function isConfirmationResponse(value: unknown): value is ConfirmationResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "active" &&
    "plan" in value &&
    isPlan(value.plan)
  );
}

export function RegistrationVerification() {
  const [status, setStatus] = useState<VerificationStatus>("checking");
  const [plan, setPlan] = useState<Plan | null>(null);
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (verificationStarted.current) return;
    verificationStarted.current = true;
    async function verifyEmail() {
      const token = window.location.hash.slice(1);
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
      if (!token) {
        setStatus("verification_error");
        return;
      }
      try {
        const response = await fetch("/api/registrations/verify", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body: unknown = await readJson(response);
        if (!response.ok || !isVerificationResponse(body)) {
          setStatus("verification_error");
          return;
        }
        setPlan(body.plan);
        setStatus("verified");
      } catch {
        setStatus("verification_error");
      }
    }
    void verifyEmail();
  }, []);

  async function confirmSimulatedPlan() {
    if (plan === null) return;
    setStatus("confirming");
    try {
      const response = await fetch("/api/registrations/confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body: unknown = await readJson(response);
      if (!response.ok || !isConfirmationResponse(body) || body.plan !== plan) {
        setStatus("confirmation_error");
        return;
      }
      setStatus("success");
    } catch {
      setStatus("confirmation_error");
    }
  }

  if (status === "checking") {
    return <p role="status">Verificando el enlace. Un momento; no lo abras veinte veces.</p>;
  }
  if (status === "verification_error") {
    return (
      <section className="content-card registration-pending" aria-labelledby="verification-error-title">
        <span className="eyebrow">Verificación no completada</span>
        <h2 id="verification-error-title">No se ha podido verificar el correo</h2>
        <p role="alert">{GENERIC_VERIFICATION_ERROR}</p>
        <a className="button-primary" href="/precios">Volver a los planes</a>
      </section>
    );
  }
  if (status === "verified" || status === "confirming" || status === "confirmation_error") {
    return (
      <section className="content-card registration-pending" aria-labelledby="email-verified-title">
        <span className="eyebrow">Correo verificado</span>
        <h2 id="email-verified-title">Correo verificado</h2>
        <p>Has verificado el correo. Tu plan {plan ? PLAN_NAMES[plan] : ""} todavía no está activo.</p>
        {status === "confirmation_error" ? <p role="alert">{CONFIRMATION_ERROR}</p> : null}
        {status === "confirming" ? <p role="status">Confirmando la contratación simulada…</p> : null}
        <button className="button-primary" type="button" onClick={() => void confirmSimulatedPlan()} disabled={status === "confirming"}>
          {status === "confirming" ? "Confirmando…" : status === "confirmation_error" ? "Reintentar confirmación" : "Confirmar contratación simulada"}
        </button>
      </section>
    );
  }
  return (
    <section className="content-card registration-pending" aria-labelledby="registration-complete-title">
      <span className="eyebrow">Contratación simulada completada</span>
      <h2 id="registration-complete-title">Contratación simulada completada</h2>
      <p role="status">El plan {plan ? PLAN_NAMES[plan] : ""} está activo en el servidor. No se ha procesado ningún pago.</p>
      <a className="button-primary" href="/">Volver al inicio</a>
    </section>
  );
}
