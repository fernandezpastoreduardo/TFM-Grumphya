import { useState, type FormEvent } from "react";
import "../../shared/styles/account.scss";

const REQUEST_ENDPOINT = "/api/auth/password-reset/request";
const COMPLETE_ENDPOINT = "/api/auth/password-reset/complete";
const GENERIC_NOTICE =
  "Si existe una cuenta activa con ese correo, recibirás instrucciones para cambiar la contraseña.";
const INVALID_LINK_NOTICE =
  "El enlace no es válido o ha caducado. Solicita uno nuevo para continuar.";
const PASSWORD_POLICY_NOTICE =
  "Usa entre 12 y 128 caracteres e incluye mayúscula, minúscula, número y carácter especial.";
const SUCCESS_NOTICE =
  "La contraseña se ha actualizado. Ya puedes iniciar sesión con la nueva contraseña.";

export function PasswordReset() {
  const [token] = useState(() => readResetToken());
  const [notice, setNotice] = useState("");
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setNotice("");
    try {
      await fetch(REQUEST_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      setNotice(GENERIC_NOTICE);
    } catch {
      setNotice("No se ha podido procesar la solicitud. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function completeReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !token) return;
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    const confirmation = form.get("password-confirmation");
    if (password !== confirmation) {
      setNotice("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    setNotice("");
    try {
      const response = await fetch(COMPLETE_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setNotice(
          hasErrorCode(body, "INVALID_PASSWORD")
            ? PASSWORD_POLICY_NOTICE
            : INVALID_LINK_NOTICE,
        );
        return;
      }
      setFinished(true);
      setNotice(SUCCESS_NOTICE);
    } catch {
      setNotice("No se ha podido guardar la contraseña. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="content-card auth-card">
        <span className="eyebrow">Acceso a tu cuenta</span>
        {finished ? (
          <>
            <h2>Contraseña actualizada</h2>
            <p role="status">{notice}</p>
            <a className="button-primary" href="/login">
              Volver a iniciar sesión
            </a>
          </>
        ) : token ? (
          <>
            <h2>Elige una nueva contraseña</h2>
            <p>El enlace solo se puede usar una vez y caduca en 20 minutos.</p>
            <form onSubmit={completeReset}>
              <label htmlFor="reset-password">Nueva contraseña</label>
              <input
                id="reset-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <label htmlFor="reset-password-confirmation">
                Repite la contraseña
              </label>
              <input
                id="reset-password-confirmation"
                name="password-confirmation"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <p>{PASSWORD_POLICY_NOTICE}</p>
              <button
                className="button-primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Guardando…" : "Guardar contraseña"}
              </button>
            </form>
            {notice ? <p role="alert">{notice}</p> : null}
          </>
        ) : (
          <>
            <h2>Recupera el acceso</h2>
            <p>
              Te enviaremos un enlace si el correo corresponde a una cuenta
              activa.
            </p>
            <form onSubmit={requestReset}>
              <label htmlFor="reset-email">Correo electrónico</label>
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
              <button
                className="button-primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Enviando…" : "Enviar instrucciones"}
              </button>
            </form>
            {notice ? <p role="status">{notice}</p> : null}
          </>
        )}
        {!finished ? (
          <p>
            <a href="/login">Volver al inicio de sesión</a>
          </p>
        ) : null}
      </section>
      <aside className="auth-aside">
        <h2>Un enlace, una sola vez.</h2>
        <p>
          Por seguridad, cambiar la contraseña cerrará tus otras sesiones
          activas.
        </p>
      </aside>
    </div>
  );
}

function readResetToken(): string | null {
  const token = window.location.hash.slice(1);
  if (!/^[a-f0-9]{64}$/u.test(token)) return null;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  return token;
}

function hasErrorCode(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === code
  );
}
