import { useCallback, useEffect, useRef, useState } from "react";
import {
  authenticatedFetch,
  clearAccessToken,
  notifySessionChanged,
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
  isAdmin: boolean;
};

export function useSessionStatus() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [accountAttempts, setAccountAttempts] =
    useState<AccountAttempts | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isMountedRef = useRef(false);
  const refreshRequestIdRef = useRef(0);

  const refresh = useCallback(async (): Promise<AccountAttempts | null> => {
    const requestId = ++refreshRequestIdRef.current;
    try {
      const response = await authenticatedFetch("/api/account/profile");
      if (!isMountedRef.current || requestId !== refreshRequestIdRef.current)
        return null;
      setIsAuthenticated(response.ok);
      if (!response.ok) {
        setAccountAttempts(null);
        setAvatarUrl(null);
        return null;
      }

      const profile: unknown = await response.json();
      if (!isMountedRef.current || requestId !== refreshRequestIdRef.current)
        return null;
      const attempts = readActivePlanAttempts(profile);
      setAccountAttempts(attempts);
      setAvatarUrl(readAvatarUrl(profile));
      return attempts;
    } catch {
      if (isMountedRef.current && requestId === refreshRequestIdRef.current) {
        setIsAuthenticated(false);
        setAccountAttempts(null);
        setAvatarUrl(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const markSessionExpired = () => {
      refreshRequestIdRef.current += 1;
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
    void refresh();
    return () => {
      isMountedRef.current = false;
      refreshRequestIdRef.current += 1;
      window.removeEventListener(SESSION_EXPIRED_EVENT, markSessionExpired);
      window.removeEventListener(USER_AVATAR_UPDATED_EVENT, markAvatarUpdated);
    };
  }, [refresh]);

  async function signOut() {
    if (isSigningOut) return;
    refreshRequestIdRef.current += 1;
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
      notifySessionChanged();
      setIsAuthenticated(false);
      setAccountAttempts(null);
      setAvatarUrl(null);
      setIsSigningOut(false);
      window.location.assign("/");
    }
  }

  return {
    isAuthenticated,
    accountAttempts,
    avatarUrl,
    isSigningOut,
    refresh,
    signOut,
  };
}

function readAvatarUrl(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const avatarUrl = value.user.avatarUrl;
  return isPublicAvatarUrl(avatarUrl) ? avatarUrl : null;
}

function readActivePlanAttempts(value: unknown): AccountAttempts | null {
  if (!isRecord(value) || !Array.isArray(value.plans)) return null;
  const isAdmin = isRecord(value.user) && value.user.role === "admin";
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
    ideas: isAdmin
      ? Number.POSITIVE_INFINITY
      : getRemaining(activeIdeasPlan, "ideas"),
    roasts: isAdmin
      ? Number.POSITIVE_INFINITY
      : getRemaining(activeRoastPlan, "roasts"),
    ideasPlanActive: isAdmin || activeIdeasPlan !== undefined,
    roastsPlanActive: isAdmin || activeRoastPlan !== undefined,
    roastMessagesSent: readRoastMessagesSent(value),
    isAdmin,
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
