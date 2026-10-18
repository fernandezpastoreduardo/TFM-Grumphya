import { useEffect, useState } from "react";
import {
  authenticatedFetch,
  clearAccessToken,
  SESSION_EXPIRED_EVENT,
  USER_AVATAR_UPDATED_EVENT,
} from "./session";
import { isPublicAvatarUrl } from "../avatar/public-avatar-url";

export type AccountAttempts = {
  ideas: number;
  roasts: number;
  ideasPlanActive: boolean;
  roastsPlanActive: boolean;
  roastMessagesSent: number;
};

export function useSessionStatus() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [accountAttempts, setAccountAttempts] =
    useState<AccountAttempts | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const markSessionExpired = () => {
      setIsAuthenticated(false);
      setAccountAttempts(null);
      setAvatarUrl(null);
    };
    const markAvatarUpdated = (event: Event) => {
      const avatarUrl = (event as CustomEvent<unknown>).detail;
      if (isPublicAvatarUrl(avatarUrl)) {
        setAvatarUrl(avatarUrl);
      }
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, markSessionExpired);
    window.addEventListener(USER_AVATAR_UPDATED_EVENT, markAvatarUpdated);
    authenticatedFetch("/api/account/profile")
      .then(async (response) => {
        if (isMounted) setIsAuthenticated(response.ok);
        if (!response.ok) return;
        const profile: unknown = await response.json();
        const attempts = readActivePlanAttempts(profile);
        if (isMounted) setAccountAttempts(attempts);
        if (isMounted) setAvatarUrl(readAvatarUrl(profile));
      })
      .catch(() => {
        if (isMounted) {
          setIsAuthenticated(false);
          setAccountAttempts(null);
          setAvatarUrl(null);
        }
      });
    return () => {
      isMounted = false;
      window.removeEventListener(SESSION_EXPIRED_EVENT, markSessionExpired);
      window.removeEventListener(USER_AVATAR_UPDATED_EVENT, markAvatarUpdated);
    };
  }, []);

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      // Clear the local token even if the request cannot reach the server.
    } finally {
      clearAccessToken();
      setIsAuthenticated(false);
      setAccountAttempts(null);
      setAvatarUrl(null);
      setIsSigningOut(false);
      window.location.assign("/");
    }
  }

  return { isAuthenticated, accountAttempts, avatarUrl, isSigningOut, signOut };
}

function readAvatarUrl(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const avatarUrl = value.user.avatarUrl;
  return isPublicAvatarUrl(avatarUrl) ? avatarUrl : null;
}

function readActivePlanAttempts(value: unknown): AccountAttempts | null {
  if (!isRecord(value) || !Array.isArray(value.plans)) return null;
  const activePlans = value.plans.filter(
    (plan) => isRecord(plan) && plan.status === "active",
  );
  const activeIdeasPlan = activePlans.find(
    (plan) => isRecord(plan) && plan.plan === "ILUMINADO",
  );
  const activeRoastPlan = activePlans.find(
    (plan) => isRecord(plan) && plan.plan === "FALTON",
  );
  return {
    ideas: getRemaining(activeIdeasPlan, "ideas"),
    roasts: getRemaining(activeRoastPlan, "roasts"),
    ideasPlanActive: activeIdeasPlan !== undefined,
    roastsPlanActive: activeRoastPlan !== undefined,
    roastMessagesSent: readRoastMessagesSent(value),
  };
}

function readRoastMessagesSent(value: unknown): number {
  if (!isRecord(value) || !isRecord(value.user)) return 0;
  const count = value.user.roastMessagesSent;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
    ? count
    : 0;
}

function getRemaining(value: unknown, scope: "ideas" | "roasts"): number {
  if (!isRecord(value) || !isRecord(value.attemptsRemaining)) return 0;
  const remaining = value.attemptsRemaining[scope];
  return typeof remaining === "number" && Number.isSafeInteger(remaining)
    ? remaining
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
