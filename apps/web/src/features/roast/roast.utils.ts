import type { AccountAttempts } from "../../infrastructure/auth/use-session-status";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { FREE_ROAST_LIMIT } from "./roast.constants";

export function getRoastAttemptsRemaining(
  isAuthenticated: boolean | null,
  accountAttempts: AccountAttempts | null,
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

export function getRoastPresentation(
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
  const quotaDescription = getRoastQuotaDescription(
    isAdmin,
    hasActiveRoastPlan,
  );
  return {
    isAdmin,
    shouldShowRoastPlanCallout,
    quotaLimit,
    showDemoExchanges: remainingAttempts === quotaLimit && !hasPreviousRoast,
    quotaDescription,
    quotaAriaLabel: isAdmin
      ? "Envíos ilimitados"
      : (remainingAttempts ?? "comprobando") +
        " de " +
        quotaLimit +
        " " +
        quotaDescription,
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
