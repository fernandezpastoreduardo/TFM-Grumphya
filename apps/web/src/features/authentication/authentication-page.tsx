import { useState, type FormEvent } from "react";
import "../../shared/styles/account.scss";
import "./authentication-page.scss";
import {
  notifySessionChanged,
  setAccessToken,
} from "../../infrastructure/auth/session";

const LOGIN_ENDPOINT = "/api/auth/login";
const LOGIN_ERROR =
  "No se ha podido iniciar sesión. Revisa los datos e inténtalo de nuevo.";
const PASSWORD_VISIBILITY_LABEL = {
  SHOW: "Mostrar contraseña",
  HIDE: "Ocultar contraseña",
} as const;

type LoginRole = "user" | "admin";

function isLoginResponse(
  value: unknown,
): value is { accessToken: string; account: { user: { role: LoginRole } } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "accessToken" in value &&
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0 &&
    "account" in value &&
    typeof value.account === "object" &&
    value.account !== null &&
    "user" in value.account &&
    typeof value.account.user === "object" &&
    value.account.user !== null &&
    "role" in value.account.user &&
    (value.account.user.role === "user" || value.account.user.role === "admin")
  );
}

export function AuthenticationPage() {
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setNotice("");
    try {
      const response = await fetch(LOGIN_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: form.get("identifier"),
          password: form.get("password"),
          rememberMe: form.get("remember") === "on",
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isLoginResponse(body)) {
        setNotice(LOGIN_ERROR);
        return;
      }
      setAccessToken(body.accessToken);
      notifySessionChanged();
      window.location.assign(
        body.account.user.role === "admin" ? "/panel-control" : "/perfil",
      );
    } catch {
      setNotice(LOGIN_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout authentication-layout">
      <section className="content-card auth-card">
        <span className="eyebrow">Acceso con usuario y contraseña</span>
        <h2>Aquí solo evaluamos ideas, no contraseñas.</h2>
        <form onSubmit={submitAuth}>
          <label htmlFor="login-identifier">Usuario o correo</label>
          <input
            id="login-identifier"
            name="identifier"
            autoComplete="username"
            required
            minLength={3}
            maxLength={254}
            placeholder="Tu alias o correo"
          />
          <label htmlFor="login-password">Contraseña</label>
          <div className="authentication-password-field">
            <input
              className="authentication-password-input"
              id="login-password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Tu contraseña"
            />
            <button
              className="authentication-password-toggle"
              type="button"
              aria-controls="login-password"
              aria-label={
                passwordVisible
                  ? PASSWORD_VISIBILITY_LABEL.HIDE
                  : PASSWORD_VISIBILITY_LABEL.SHOW
              }
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <label className="remember-option" htmlFor="login-remember">
            <input id="login-remember" type="checkbox" name="remember" />{" "}
            Recordarme en este dispositivo
          </label>
          <button
            className="button-primary"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Entrando…" : "Entrar"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p>
          <a href="/recuperar-contrasena">He olvidado la contraseña</a>
        </p>
        {notice ? (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        ) : null}
        <div className="login-copy">
          <p>
            ¿Quieres hacer login con Google, GitHub o la app del supermercado?
          </p>
          <strong>Pues no se puede.</strong>
          <p>
            Tus buenas ideas, las aprobadas, son tuyas. Las malas pueden acabar
            en un ranking sin tu nombre ni el texto original.
          </p>
          <p>Ánimo, que no cuesta tanto poner un usuario y una contraseña.</p>
        </div>
      </section>
      <aside className="auth-aside">
        <div
          className="auth-creature auth-creature-privacy"
          aria-hidden="true"
        />
        <h2>Tu historial no es público.</h2>
        <p>
          El acceso real usará sesión segura, errores genéricos y límites
          aplicados por el servidor.
        </p>
      </aside>
    </div>
  );
}
