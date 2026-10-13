import { useState, type FormEvent } from "react";

// PROTOTYPE: sample exchanges and the reply below are fixtures until the roast service exists.
const SAMPLE_EXCHANGES = [
  {
    user: "Quiero una app que haga mi trabajo mientras duermo.",
    grumphya:
      "La idea ya existe: se llama contratar a alguien. Lo de pagarle suele ser la parte que sorprende.",
  },
  {
    user: "¿Y si juntamos todas las redes sociales en una?",
    grumphya:
      "Por fin: una forma de recibir todas las notificaciones que ya estabas ignorando.",
  },
  {
    user: "Mi idea vale mil millones.",
    grumphya:
      "Qué bien. Cuando encuentres a alguien dispuesto a pagar uno, me avisas.",
  },
] as const;
const MAX_ROAST_ATTEMPTS = 3;
const PROTOTYPE_ROAST_REPLY =
  "He recibido tu mensaje. Mi respuesta definitiva todavía está de vacaciones.";

export function Roast() {
  const [message, setMessage] = useState("");
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const remainingAttempts = Math.max(
    0,
    MAX_ROAST_ATTEMPTS - sentMessages.length,
  );

  // PROTOTYPE: keep this interaction local; server-side usage counters are not wired yet.
  function submitRoast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value || remainingAttempts === 0) return;
    setSentMessages((previous) => [...previous, value]);
    setMessage("");
  }

  return (
    <div className="roast-layout">
      <section
        className="content-card roast-demo"
        aria-labelledby="roast-demo-title"
      >
        <div className="content-card-heading">
          <div>
            <span className="eyebrow">Últimos intercambios</span>
            <h2 id="roast-demo-title">La conversación va regular</h2>
          </div>
          <span
            className="demo-counter"
            aria-label={`${remainingAttempts} envíos de demostración restantes`}
          >
            {remainingAttempts} <small>/ 3</small>
          </span>
        </div>
        <p className="prototype-stamp">
          <span aria-hidden="true">✳</span> Conversaciones de ejemplo · vista de
          demostración
        </p>
        <div className="roast-thread">
          {SAMPLE_EXCHANGES.map((item) => (
            <article className="roast-exchange" key={item.user}>
              <p className="roast-user">
                <span className="bubble-avatar" aria-hidden="true">
                  TÚ
                </span>
                {item.user}
              </p>
              <p className="roast-reply">
                <span
                  className="bubble-avatar creature-avatar"
                  aria-hidden="true"
                >
                  G
                </span>
                {item.grumphya}
              </p>
            </article>
          ))}
          {sentMessages.map((item, index) => (
            <article className="roast-exchange" key={`${item}-${index}`}>
              <p className="roast-user">
                <span className="bubble-avatar" aria-hidden="true">
                  TÚ
                </span>
                {item}
              </p>
              <p className="roast-reply">
                <span
                  className="bubble-avatar creature-avatar"
                  aria-hidden="true"
                >
                  G
                </span>
                {PROTOTYPE_ROAST_REPLY}
              </p>
            </article>
          ))}
        </div>
        <form className="roast-composer" onSubmit={submitRoast}>
          <label className="sr-only" htmlFor="roast-message">
            Tu insulto para Grumphya
          </label>
          <input
            id="roast-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Venga, a ver si me haces sudar…"
            maxLength={400}
            disabled={remainingAttempts === 0}
          />
          <button
            type="submit"
            aria-label="Enviar insulto"
            disabled={!message.trim() || remainingAttempts === 0}
          >
            ↑
          </button>
        </form>
        <p className="prototype-stamp">
          La respuesta y los usos restantes son de ejemplo.
        </p>
      </section>
      <aside className="roast-aside">
        <div className="aside-creature" aria-hidden="true" />
        <h2>¿Te has quedado con ganas?</h2>
        <p>
          El plan Faltón amplía tus envíos diarios. Once, sí. A alguien le hizo
          gracia el número.
        </p>
        <a className="button-primary" href="/precios">
          Ver el plan Faltón <span aria-hidden="true">↗</span>
        </a>
        <p className="privacy-footnote">
          No uses esto para enviar datos personales. La conversación de ejemplo
          no se guarda.
        </p>
      </aside>
    </div>
  );
}
