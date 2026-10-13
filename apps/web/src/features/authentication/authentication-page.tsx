import { useState, type FormEvent } from "react";

type AuthenticationPageProps = { createAccount: boolean };

function getSelectedPlan(plan: string | null): string | null {
  if (plan === "iluminado") return "Iluminado";
  if (plan === "falton") return "Faltón";
  return null;
}

export function AuthenticationPage({ createAccount }: AuthenticationPageProps) {
  const [notice, setNotice] = useState("");
  const plan = new URLSearchParams(window.location.search).get("plan");
  const selectedPlan = getSelectedPlan(plan);

  if (createAccount && selectedPlan === null) {
    return (
      <section className="content-card account-plan-required">
        <span className="eyebrow">Primero, una decisión</span>
        <h2>Elige un plan antes de crear la cuenta.</h2>
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

  // PROTOTYPE: auth submission is local feedback until the server-side session flow exists.
  function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(
      createAccount
        ? `Prototipo: se prepararía el alta de ${selectedPlan} y su contratación simulada.`
        : "No se ha podido iniciar sesión. Revisa los datos e inténtalo de nuevo.",
    );
  }

  return (
    <div className="auth-layout">
      <section className="content-card auth-card">
        <span className="eyebrow">
          {createAccount
            ? `Plan seleccionado: ${selectedPlan}`
            : "Acceso con usuario y contraseña"}
        </span>
        <h2>
          {createAccount
            ? "Vamos a ponerle nombre a la cuenta"
            : "No, no tenemos login con el súper"}
        </h2>
        <form onSubmit={submitAuth}>
          <label>
            Usuario
            <input
              name="username"
              autoComplete="username"
              required
              minLength={3}
              placeholder="Tu alias"
            />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete={createAccount ? "new-password" : "current-password"}
              required
              minLength={createAccount ? 12 : undefined}
              placeholder={
                createAccount ? "Mínimo 12 caracteres" : "Tu contraseña"
              }
            />
          </label>
          {!createAccount ? (
            <label className="remember-option">
              <input type="checkbox" name="remember" /> Recordarme en este
              dispositivo
            </label>
          ) : null}
          <button className="button-primary" type="submit">
            {createAccount ? "Continuar con el alta simulada" : "Entrar"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        {notice ? (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        ) : null}
        {createAccount ? (
          <p className="auth-privacy">
            La fecha, el identificador de usuario y el estado del plan los
            establecería el servidor. No pedimos tarjeta en esta simulación.
          </p>
        ) : (
          <div className="login-copy">
            <p>
              ¿Quieres hacer login con Google, GitHub o la app del supermercado?
            </p>
            <strong>Pues no se puede.</strong>
            <p>
              Tus buenas ideas, las aprobadas, son tuyas. Las malas pueden
              acabar en un ranking sin tu nombre ni el texto original.
            </p>
            <p>Ánimo, que no cuesta tanto poner un usuario y una contraseña.</p>
          </div>
        )}
        <p className="prototype-stamp">
          Demostración visual; la cuenta y el plan no se activan todavía.
        </p>
      </section>
      <aside className="auth-aside">
        <div className="auth-creature" aria-hidden="true" />
        <h2>
          {createAccount
            ? "Tus ideas aprobadas son tuyas."
            : "Tu historial no es público."}
        </h2>
        <p>
          {createAccount
            ? "Creamos la cuenta porque has elegido un plan. Los visitantes anónimos no necesitan registrarse."
            : "El acceso real usará sesión segura, errores genéricos y límites aplicados por el servidor."}
        </p>
      </aside>
    </div>
  );
}
