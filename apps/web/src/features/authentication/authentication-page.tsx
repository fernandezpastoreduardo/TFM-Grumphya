import { useState, type FormEvent } from "react";

export function AuthenticationPage() {
  const [notice, setNotice] = useState("");

  function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("No se ha podido iniciar sesión. Revisa los datos e inténtalo de nuevo.");
  }

  return (
    <div className="auth-layout">
      <section className="content-card auth-card">
        <span className="eyebrow">Acceso con usuario y contraseña</span>
        <h2>No, no tenemos login con el súper</h2>
        <form onSubmit={submitAuth}>
          <label htmlFor="login-username">Usuario</label>
          <input id="login-username" name="username" autoComplete="username" required minLength={3} placeholder="Tu alias" />
          <label htmlFor="login-password">Contraseña</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required placeholder="Tu contraseña" />
          <label className="remember-option" htmlFor="login-remember">
            <input id="login-remember" type="checkbox" name="remember" /> Recordarme en este dispositivo
          </label>
          <button className="button-primary" type="submit">Entrar <span aria-hidden="true">↗</span></button>
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
