import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAnonymousUsage } from "../../shared/hooks/use-anonymous-usage";
import { ErrorPages } from "../error-pages/error-pages";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { RoastInput } from "./components/RoastInput";
import { RoastThread } from "./components/RoastThread";
import { RoastFailureDialog } from "./components/RoastFailureDialog";
import {
  RoastRanking,
  type RoastRankingState,
} from "./components/RoastRanking";
import { getRoastRanking } from "./services/get-roast-ranking";
import { UsageLimitDialog } from "../../shared/components/usage-limit-dialog";
import { EmailVerificationRequiredDialog } from "../../shared/components/email-verification-required-dialog";
import "../../shared/components/shared-components.scss";
import "./roast.scss";

const FREE_ROAST_LIMIT = 3;
export function Roast() {
  const roastThreadRef = useRef<HTMLDivElement>(null);
  const [sentMessages, setSentMessages] = useState<
    Array<{ id: string; message: string; reply: string }>
  >([]);
  const usageState = useAnonymousUsage();
  const session = useSessionStatus();
  const [rankingState, setRankingState] = useState<RoastRankingState>({
    status: "loading",
  });
  const [rankingRevision, setRankingRevision] = useState(0);
  const [isDailyQuotaDialogOpen, setIsDailyQuotaDialogOpen] = useState(false);
  const [isReplyFailureDialogOpen, setIsReplyFailureDialogOpen] =
    useState(false);
  const [isEmailVerificationDialogOpen, setIsEmailVerificationDialogOpen] =
    useState(false);
  const availableAttempts = getRoastAttemptsRemaining(
    session.isAuthenticated,
    session.accountAttempts,
    usageState.usage?.roasts.remaining,
  );
  const [attemptsOverride, setAttemptsOverride] = useState<number | null>(null);
  useEffect(() => {
    setAttemptsOverride(null);
  }, [availableAttempts]);
  useLayoutEffect(() => {
    if (sentMessages.length === 0) return;

    const roastThread = roastThreadRef.current;
    if (!roastThread) return;

    roastThread.scrollTop = roastThread.scrollHeight;
  }, [sentMessages.length]);
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
  const {
    isAdmin,
    shouldShowRoastPlanCallout,
    quotaLimit,
    showDemoExchanges,
    quotaDescription,
  } = getRoastPresentation(
    session,
    usageState.usage?.roasts.remaining,
    remainingAttempts,
    sentMessages.length,
  );

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
            <span aria-hidden="true">✳</span> Conversaciones de ejemplo
          </p>
        ) : null}
        <RoastThread
          threadRef={roastThreadRef}
          remainingAttempts={remainingAttempts}
          showDemoExchanges={showDemoExchanges}
          sentMessages={sentMessages}
        />
        <RoastInput
          remainingAttempts={remainingAttempts}
          quotaLimit={quotaLimit}
          quotaDescription={quotaDescription}
          onSubmitted={(message, reply) => {
            setIsReplyFailureDialogOpen(false);
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
          onAccountUsageRefresh={
            session.isAuthenticated === false ? undefined : session.refresh
          }
          onDailyQuotaExhausted={() => setIsDailyQuotaDialogOpen(true)}
          onReplyUnavailable={() => setIsReplyFailureDialogOpen(true)}
          onEmailVerificationRequired={() =>
            setIsEmailVerificationDialogOpen(true)
          }
        />
        <p className="prototype-stamp">
          {showDemoExchanges
            ? "Los intercambios iniciales son ejemplos. Grumphya tratará tus mensajes con el debido respeto."
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
      {isDailyQuotaDialogOpen ? (
        <UsageLimitDialog
          open
          scope="roasts"
          onClose={() => setIsDailyQuotaDialogOpen(false)}
        />
      ) : null}
      <RoastFailureDialog
        open={isReplyFailureDialogOpen}
        onClose={() => setIsReplyFailureDialogOpen(false)}
      />
      <EmailVerificationRequiredDialog
        open={isEmailVerificationDialogOpen}
        onClose={() => setIsEmailVerificationDialogOpen(false)}
      />
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

function getRoastPresentation(
  session: ReturnType<typeof useSessionStatus>,
  freeRemaining: number | undefined,
  remainingAttempts: number | null,
  sentCount: number,
) {
  const isAuthenticated = session.isAuthenticated === true;
  const hasActiveRoastPlan =
    isAuthenticated && session.accountAttempts?.roastsPlanActive === true;
  const isAdmin = session.accountAttempts?.isAdmin === true;
  const shouldShowRoastPlanCallout =
    session.isAuthenticated === false ||
    (isAuthenticated &&
      session.accountAttempts !== null &&
      !session.accountAttempts.roastsPlanActive);
  const quotaLimit = getRoastQuotaLimit(isAdmin, hasActiveRoastPlan);
  const hasPreviousRoast =
    sentCount > 0 ||
    (remainingAttempts !== null && remainingAttempts < quotaLimit) ||
    (freeRemaining ?? FREE_ROAST_LIMIT) < FREE_ROAST_LIMIT ||
    (session.accountAttempts?.roastMessagesSent ?? 0) > 0;
  return {
    isAdmin,
    shouldShowRoastPlanCallout,
    quotaLimit,
    showDemoExchanges: remainingAttempts === quotaLimit && !hasPreviousRoast,
    quotaDescription: getRoastQuotaDescription(isAdmin, hasActiveRoastPlan),
  };
}

function getRoastQuotaLimit(isAdmin: boolean, hasActivePlan: boolean): number {
  if (isAdmin) return Number.POSITIVE_INFINITY;
  if (hasActivePlan) return 11;
  return FREE_ROAST_LIMIT;
}

function getRoastQuotaDescription(
  isAdmin: boolean,
  hasActivePlan: boolean,
): string {
  if (isAdmin) return "envíos ilimitados";
  if (hasActivePlan) return "envíos disponibles hoy";
  return "envíos gratuitos restantes";
}
