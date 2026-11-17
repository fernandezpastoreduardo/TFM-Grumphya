import type { FormEvent } from "react";
import { PASSWORD_POLICY_NOTICE } from "../password-reset.constants";

export function PasswordResetView({
  token,
  finished,
  invalidLink,
  notice,
  submitting,
  onRequest,
  onComplete,
}: {
  token: string | null;
  finished: boolean;
  invalidLink: boolean;
  notice: string;
  submitting: boolean;
  onRequest: (event: FormEvent<HTMLFormElement>) => void;
  onComplete: (event: FormEvent<HTMLFormElement>) => void;
}) {
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
        ) : token && !invalidLink ? (
          <>
            <h2>Elige una nueva contraseña</h2>
            <p>El enlace solo se puede usar una vez y caduca en 20 minutos.</p>
            <form onSubmit={onComplete}>
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
            <form className="password-reset-request-form" onSubmit={onRequest}>
              <label htmlFor="reset-email">
                Correo electrónico
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
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
