import { useState, type FormEvent } from "react";
import { PASSWORD_VISIBILITY_LABEL } from "../authentication.constants";

export function AuthenticationForm({
  submitting,
  notice,
  onSubmit,
}: {
  submitting: boolean;
  notice: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <div className="auth-layout authentication-layout">
      <section className="content-card auth-card">
        <span className="eyebrow">Acceso con usuario y contraseña</span>
        <h2>¿Vienes a por más? Estupendo, tengo servidores para eso y más.</h2>
        <form onSubmit={onSubmit}>
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
