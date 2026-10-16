import { useState, type FormEvent } from "react";
import "../../shared/styles/account.scss";
import { setAccessToken } from "../../infrastructure/auth/session";

const LOGIN_ENDPOINT = "/api/auth/login";
const LOGIN_ERROR =
  "No se ha podido iniciar sesión. Revisa los datos e inténtalo de nuevo.";

function isLoginResponse(value: unknown): value is { accessToken: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "accessToken" in value &&
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0
  );
}

export function AuthenticationPage() {
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      window.location.assign("/perfil");
    } catch {
      setNotice(LOGIN_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="content-card auth-card">
        <span className="eyebrow">Acceso con usuario y contraseña</span>
        <h2>No, no tenemos login con el súper</h2>
        <form onSubmit={submitAuth}>
          <label htmlFor="login-identifier">Usuario o correo</label>
          <input id="login-identifier" name="identifier" autoComplete="username" required minLength={3} maxLength={254} placeholder="Tu alias o correo" />
          <label htmlFor="login-password">Contraseña</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required placeholder="Tu contraseña" />
          <label className="remember-option" htmlFor="login-remember">
            <input id="login-remember" type="checkbox" name="remember" /> Recordarme en este dispositivo
          </label>
          <button className="button-primary" type="submit" disabled={submitting}>
            {submitting ? "Entrando…" : "Entrar"} <span aria-hidden="true">↗</span>
          </button>
        </form>
        {notice ? <p className="auth-notice" role="status">{notice}</p> : null}
        <div className="login-copy">
          <p>¿Quieres hacer login con Google, GitHub o la app del supermercado?</p>
          <strong>Pues no se puede.</strong>
          <p>Tus buenas ideas, las aprobadas, son tuyas. Las malas pueden acabar en un ranking sin tu nombre ni el texto original.</p>
          <p>Ánimo, que no cuesta tanto poner un usuario y una contraseña.</p>
        </div>
      </section>
      <aside className="auth-aside">
        <div className="auth-creature" aria-hidden="true" />
        <h2>Tu historial no es público.</h2>
        <p>El acceso real usará sesión segura, errores genéricos y límites aplicados por el servidor.</p>
      </aside>
    </div>
  );
}
