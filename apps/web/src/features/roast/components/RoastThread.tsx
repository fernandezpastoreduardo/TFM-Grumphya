import type { RefObject } from "react";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../../shared/components/loading-skeleton";

// Only the opening exchanges are fixtures; submitted messages use the roast endpoint.
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
type RoastThreadProps = {
  threadRef: RefObject<HTMLDivElement | null>;
  remainingAttempts: number | null;
  showDemoExchanges: boolean;
  sentMessages: Array<{ id: string; message: string; reply: string }>;
};

export function RoastThread({
  threadRef,
  remainingAttempts,
  showDemoExchanges,
  sentMessages,
}: RoastThreadProps) {
  return (
    <div className="roast-thread" ref={threadRef}>
      {remainingAttempts === null && sentMessages.length === 0 ? (
        <LoadingSkeleton
          label="Consultando los mensajes de la conversación"
          className="roast-thread-skeleton"
          showImmediately
        >
          {Array.from({ length: 3 }, (_, index) => (
            <div className="roast-exchange-skeleton" key={index}>
              <SkeletonBlock className="skeleton-roast-bubble user" />
              <SkeletonBlock className="skeleton-roast-bubble reply" />
            </div>
          ))}
        </LoadingSkeleton>
      ) : null}
      {!showDemoExchanges &&
      remainingAttempts !== null &&
      sentMessages.length === 0 ? (
        <p className="roast-attempt-feedback">
          No hay mensajes anteriores guardados.
        </p>
      ) : null}
      {showDemoExchanges
        ? SAMPLE_EXCHANGES.map((item) => (
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
          ))
        : null}
      {sentMessages.map((item) => (
        <article className="roast-exchange" key={item.id}>
          <p className="roast-user">
            <span className="bubble-avatar" aria-hidden="true">
              TÚ
            </span>
            {item.message}
          </p>
          <p className="roast-reply">
            <span className="bubble-avatar creature-avatar" aria-hidden="true">
              G
            </span>
            {item.reply}
          </p>
        </article>
      ))}
    </div>
  );
}
