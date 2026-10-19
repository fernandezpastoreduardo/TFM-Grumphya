import { useEffect, useState } from "react";
import { useAnonymousUsage } from "../../shared/hooks/use-anonymous-usage";
import { ErrorPages } from "../error-pages/error-pages";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { RoastInput } from "./components/RoastInput";
import {
  RoastRanking,
  type RoastRankingState,
} from "./components/RoastRanking";
import { getRoastRanking } from "./services/get-roast-ranking";
import "./roast.scss";

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
const FREE_ROAST_LIMIT = 3;
export function Roast() {
  const [sentMessages, setSentMessages] = useState<
    Array<{ id: string; message: string; reply: string }>
  >([]);
  const usageState = useAnonymousUsage();
  const session = useSessionStatus();
  const [rankingState, setRankingState] = useState<RoastRankingState>({
    status: "loading",
  });
  const [rankingRevision, setRankingRevision] = useState(0);
  const isAuthenticated = session.isAuthenticated === true;
  const hasActiveRoastPlan =
    isAuthenticated && session.accountAttempts?.roastsPlanActive === true;
  const isAdmin = session.accountAttempts?.isAdmin === true;
  const shouldShowRoastPlanCallout =
    session.isAuthenticated === false ||
    (session.isAuthenticated === true &&
      session.accountAttempts !== null &&
      !session.accountAttempts.roastsPlanActive);
  const availableAttempts = getRoastAttemptsRemaining(
    session.isAuthenticated,
    session.accountAttempts,
    usageState.usage?.roasts.remaining,
  );
  const [attemptsOverride, setAttemptsOverride] = useState<number | null>(null);
  useEffect(() => {
    setAttemptsOverride(null);
  }, [availableAttempts]);
  useEffect(() => {
    const controller = new AbortController();
    setRankingState({ status: "loading" });
    getRoastRanking(controller.signal)
      .then((ranking) => setRankingState({ status: "success", ranking }))
      .catch(() => {
        if (!controller.signal.aborted) setRankingState({ status: "error" });
      });

    return () => controller.abort();
  }, [rankingRevision]);
  const remainingAttempts = attemptsOverride ?? availableAttempts;
  const quotaLimit = isAdmin
    ? Number.POSITIVE_INFINITY
    : hasActiveRoastPlan
      ? 11
      : FREE_ROAST_LIMIT;
  const hasPreviousRoast =
    sentMessages.length > 0 ||
    (remainingAttempts !== null && remainingAttempts < quotaLimit) ||
    (usageState.usage?.roasts.remaining ?? FREE_ROAST_LIMIT) <
      FREE_ROAST_LIMIT ||
    (session.accountAttempts?.roastMessagesSent ?? 0) > 0;
  const showDemoExchanges =
    remainingAttempts === quotaLimit && !hasPreviousRoast;
  const quotaDescription = isAdmin
    ? "envíos ilimitados"
    : hasActiveRoastPlan
      ? "envíos disponibles hoy"
      : "envíos gratuitos restantes";

  if (usageState.errorStatus === 429) {
    return <ErrorPages status="429" detail={usageState.error} />;
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
            aria-label={
              isAdmin
                ? "Envíos ilimitados"
                : `${remainingAttempts ?? "comprobando"} de ${quotaLimit} ${quotaDescription}`
            }
          >
            {isAdmin ? "∞" : (remainingAttempts ?? "…")}{" "}
            {!isAdmin ? <small>/ {quotaLimit}</small> : null}
          </span>
        </div>
        {showDemoExchanges ? (
          <p className="prototype-stamp">
            <span aria-hidden="true">✳</span> Conversaciones de ejemplo · vista
            de demostración
          </p>
        ) : null}
        <div className="roast-thread">
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
        <RoastInput
          remainingAttempts={remainingAttempts}
          quotaLimit={quotaLimit}
          quotaDescription={quotaDescription}
          onSubmitted={(message, reply) => {
            setSentMessages((previous) => [
              ...previous,
              { id: crypto.randomUUID(), message, reply },
            ]);
            setAttemptsOverride((current) =>
              Math.max(0, (current ?? availableAttempts ?? 1) - 1),
            );
            setRankingRevision((revision) => revision + 1);
          }}
          onUsageRefresh={usageState.refresh}
        />
        <p className="prototype-stamp">
          {showDemoExchanges
            ? "Los intercambios iniciales son ejemplos. Tus mensajes reciben la respuesta configurada en el servidor."
            : "Los mensajes de roast no se guardan para futuras visitas. Los intercambios de esta sesión aparecen aquí."}
        </p>
      </section>
      <div className="roast-sidebar">
        <RoastRanking
          state={rankingState}
          onRetry={() => setRankingRevision((revision) => revision + 1)}
        />
        {shouldShowRoastPlanCallout ? (
          <aside className="roast-aside">
            <div className="aside-creature" aria-hidden="true" />
            <h2>¿Te has quedado con ganas?</h2>
            <p>
              El plan Faltón amplía tus envíos diarios. Once, sí. A alguien le
              hizo gracia el número.
            </p>
            <a className="button-primary" href="/precios">
              Ver el plan Faltón <span aria-hidden="true">↗</span>
            </a>
            <p className="privacy-footnote">
              No uses esto para enviar datos personales. Una cookie recuerda tus
              tres envíos gratuitos y una señal temporal derivada de la IP ayuda
              a frenar abusos.
            </p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function getRoastAttemptsRemaining(
  isAuthenticated: boolean | null,
  accountAttempts: {
    roasts: number;
    roastsPlanActive: boolean;
    isAdmin?: boolean;
  } | null,
  freeAttempts: number | undefined,
): number | null {
  if (isAuthenticated === null) return null;
  if (isAuthenticated && accountAttempts === null) return null;
  if (isAuthenticated && accountAttempts?.isAdmin)
    return Number.POSITIVE_INFINITY;
  if (isAuthenticated && accountAttempts?.roastsPlanActive)
    return accountAttempts.roasts;
  return freeAttempts ?? null;
}
