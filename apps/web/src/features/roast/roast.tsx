import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAnonymousUsage } from "../../shared/hooks/use-anonymous-usage";
import { ErrorPages } from "../error-pages/error-pages";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { RoastWorkspace } from "./components/RoastWorkspace";
import { useRoastRanking } from "./use-roast-ranking";
import { getRoastAttemptsRemaining, getRoastPresentation } from "./roast.utils";
import type { SentRoastMessage } from "./roast.models";
import "../../shared/components/shared-components.scss";
import "./roast.scss";

export function Roast() {
  const roastThreadRef = useRef<HTMLDivElement>(null);
  const [sentMessages, setSentMessages] = useState<SentRoastMessage[]>([]);
  const usageState = useAnonymousUsage();
  const session = useSessionStatus();
  const ranking = useRoastRanking();
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

  const remainingAttempts = attemptsOverride ?? availableAttempts;
  const presentation = getRoastPresentation(
    session,
    usageState.usage?.roasts.remaining,
    remainingAttempts,
    sentMessages.length,
  );

  if (usageState.errorStatus === 429) {
    return <ErrorPages status="429" detail={usageState.error} />;
  }

  return (
    <RoastWorkspace
      threadRef={roastThreadRef}
      remainingAttempts={remainingAttempts}
      quotaLimit={presentation.quotaLimit}
      quotaDescription={presentation.quotaDescription}
      quotaAriaLabel={presentation.quotaAriaLabel}
      isAdmin={presentation.isAdmin}
      showDemoExchanges={presentation.showDemoExchanges}
      sentMessages={sentMessages}
      rankingState={ranking.state}
      shouldShowRoastPlanCallout={presentation.shouldShowRoastPlanCallout}
      onRankingRetry={ranking.retry}
      onSubmitted={(message, reply) => {
        setIsReplyFailureDialogOpen(false);
        setSentMessages((previous) => [
          ...previous,
          { id: crypto.randomUUID(), message, reply },
        ]);
        setAttemptsOverride((current) =>
          Math.max(0, (current ?? availableAttempts ?? 1) - 1),
        );
        ranking.retry();
      }}
      onUsageRefresh={usageState.refresh}
      onAccountUsageRefresh={
        session.isAuthenticated === false ? undefined : session.refresh
      }
      onDailyQuotaExhausted={() => setIsDailyQuotaDialogOpen(true)}
      onReplyUnavailable={() => setIsReplyFailureDialogOpen(true)}
      onEmailVerificationRequired={() => setIsEmailVerificationDialogOpen(true)}
      isDailyQuotaDialogOpen={isDailyQuotaDialogOpen}
      isReplyFailureDialogOpen={isReplyFailureDialogOpen}
      isEmailVerificationDialogOpen={isEmailVerificationDialogOpen}
      onDailyQuotaDialogClose={() => setIsDailyQuotaDialogOpen(false)}
      onReplyFailureDialogClose={() => setIsReplyFailureDialogOpen(false)}
      onEmailVerificationDialogClose={() =>
        setIsEmailVerificationDialogOpen(false)
      }
    />
  );
}
