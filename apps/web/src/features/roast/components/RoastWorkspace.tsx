import { lazy, Suspense, type ComponentProps, type RefObject } from "react";
import { RoastInput } from "./RoastInput";
import { RoastRanking, type RoastRankingState } from "./RoastRanking";
import { RoastThread } from "./RoastThread";
import type { SentRoastMessage } from "../roast.models";

const EmailVerificationRequiredDialog = lazy(() =>
  import("../../../shared/components/email-verification-required-dialog").then(
    (module) => ({ default: module.EmailVerificationRequiredDialog }),
  ),
);
const UsageLimitDialog = lazy(() =>
  import("../../../shared/components/usage-limit-dialog").then((module) => ({
    default: module.UsageLimitDialog,
  })),
);
const RoastFailureDialog = lazy(() =>
  import("./RoastFailureDialog").then((module) => ({
    default: module.RoastFailureDialog,
  })),
);

type RoastWorkspaceProps = {
  threadRef: RefObject<HTMLDivElement | null>;
  remainingAttempts: number | null;
  quotaLimit: number;
  quotaDescription: string;
  quotaAriaLabel: string;
  isAdmin: boolean;
  showDemoExchanges: boolean;
  sentMessages: SentRoastMessage[];
  rankingState: RoastRankingState;
  shouldShowRoastPlanCallout: boolean;
  onRankingRetry: () => void;
  onSubmitted: (message: string, reply: string) => void;
  onUsageRefresh: () => Promise<void>;
  onAccountUsageRefresh?: RoastInputProps["onAccountUsageRefresh"];
  onDailyQuotaExhausted: () => void;
  onReplyUnavailable: () => void;
  onEmailVerificationRequired: () => void;
  isDailyQuotaDialogOpen: boolean;
  isReplyFailureDialogOpen: boolean;
  isEmailVerificationDialogOpen: boolean;
  onDailyQuotaDialogClose: () => void;
  onReplyFailureDialogClose: () => void;
  onEmailVerificationDialogClose: () => void;
};

type RoastInputProps = ComponentProps<typeof RoastInput>;

export function RoastWorkspace({
  threadRef,
  remainingAttempts,
  quotaLimit,
  quotaDescription,
  quotaAriaLabel,
  isAdmin,
  showDemoExchanges,
  sentMessages,
  rankingState,
  shouldShowRoastPlanCallout,
  onRankingRetry,
  onSubmitted,
  onUsageRefresh,
  onAccountUsageRefresh,
  onDailyQuotaExhausted,
  onReplyUnavailable,
  onEmailVerificationRequired,
  isDailyQuotaDialogOpen,
  isReplyFailureDialogOpen,
  isEmailVerificationDialogOpen,
  onDailyQuotaDialogClose,
  onReplyFailureDialogClose,
  onEmailVerificationDialogClose,
}: RoastWorkspaceProps) {
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
          <span className="demo-counter" aria-label={quotaAriaLabel}>
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
          threadRef={threadRef}
          remainingAttempts={remainingAttempts}
          showDemoExchanges={showDemoExchanges}
          sentMessages={sentMessages}
        />
        <RoastInput
          remainingAttempts={remainingAttempts}
          quotaLimit={quotaLimit}
          quotaDescription={quotaDescription}
          onSubmitted={onSubmitted}
          onUsageRefresh={onUsageRefresh}
          onAccountUsageRefresh={onAccountUsageRefresh}
          onDailyQuotaExhausted={onDailyQuotaExhausted}
          onReplyUnavailable={onReplyUnavailable}
          onEmailVerificationRequired={onEmailVerificationRequired}
        />
        <p className="prototype-stamp">
          {showDemoExchanges
            ? "Los intercambios iniciales son ejemplos. Grumphya tratará tus mensajes con el debido respeto."
            : "Los mensajes de roast no se guardan para futuras visitas. Los intercambios de esta sesión aparecen aquí."}
        </p>
      </section>
      <div className="roast-sidebar">
        <RoastRanking state={rankingState} onRetry={onRankingRetry} />
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
        <Suspense fallback={null}>
          <UsageLimitDialog
            open
            scope="roasts"
            onClose={onDailyQuotaDialogClose}
          />
        </Suspense>
      ) : null}
      {isReplyFailureDialogOpen ? (
        <Suspense fallback={null}>
          <RoastFailureDialog open onClose={onReplyFailureDialogClose} />
        </Suspense>
      ) : null}
      {isEmailVerificationDialogOpen ? (
        <Suspense fallback={null}>
          <EmailVerificationRequiredDialog
            open
            onClose={onEmailVerificationDialogClose}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
