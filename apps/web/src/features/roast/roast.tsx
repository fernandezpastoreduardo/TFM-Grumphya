import { useRef, useState, type FormEvent } from "react";
import { useAnonymousUsage } from "../../shared/hooks/use-anonymous-usage";
import "./roast.scss";

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
const ROAST_ENDPOINT = "/api/roast";
const ROAST_ERROR_MESSAGE = "No se pudo enviar el mensaje. Inténtalo de nuevo.";

export function Roast() {
  const [message, setMessage] = useState("");
  const [sentMessages, setSentMessages] = useState<
    Array<{ id: string; message: string; reply: string }>
  >([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const isSendingRef = useRef(false);
  const usageState = useAnonymousUsage();
  const remainingAttempts = usageState.usage?.roasts.remaining ?? 0;

  async function submitRoast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value || remainingAttempts === 0 || isSendingRef.current) return;
    isSendingRef.current = true;
    setIsSending(true);
    setError("");
    try {
      const response = await fetch(ROAST_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ message: value }),
      });
      if (!response.ok) {
        let errorMessage = ROAST_ERROR_MESSAGE;
        try {
          const payload: unknown = await response.json();
          if (
            typeof payload === "object" &&
            payload !== null &&
            "message" in payload &&
            typeof payload.message === "string"
          )
            errorMessage = payload.message;
        } catch {
          errorMessage = ROAST_ERROR_MESSAGE;
        }
        throw new Error(errorMessage);
      }
      const payload: unknown = await response.json();
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("reply" in payload) ||
        typeof payload.reply !== "string"
      )
        throw new Error(ROAST_ERROR_MESSAGE);
      setSentMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          message: value,
          reply: payload.reply as string,
        },
      ]);
      setMessage("");
      await usageState.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : ROAST_ERROR_MESSAGE);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
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
            aria-label={`${remainingAttempts} envíos gratuitos restantes`}
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
          {sentMessages.map((item) => (
            <article className="roast-exchange" key={item.id}>
              <p className="roast-user">
                <span className="bubble-avatar" aria-hidden="true">
                  TÚ
                </span>
                {item.message}
              </p>
              <p className="roast-reply">
                <span
                  className="bubble-avatar creature-avatar"
                  aria-hidden="true"
                >
                  G
                </span>
                {item.reply}
              </p>
            </article>
          ))}
        </div>
        <form
          className="roast-composer"
          onSubmit={(event) => void submitRoast(event)}
        >
          <label className="sr-only" htmlFor="roast-message">
            Tu insulto para Grumphya
          </label>
          <input
            id="roast-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Venga, a ver si me haces sudar…"
            maxLength={400}
            disabled={
              remainingAttempts === 0 || usageState.isLoading || isSending
            }
          />
          <button
            type="submit"
            aria-label="Enviar insulto"
            disabled={
              !message.trim() ||
              remainingAttempts === 0 ||
              usageState.isLoading ||
              isSending
            }
          >
            ↑
          </button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
        <p className="prototype-stamp">
          La respuesta es una demostración; los usos restantes los controla el
          servidor.
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
          No uses esto para enviar datos personales. Una cookie recuerda tus
          tres envíos gratuitos y una señal temporal derivada de la IP ayuda a
          frenar abusos.
        </p>
      </aside>
    </div>
  );
}
