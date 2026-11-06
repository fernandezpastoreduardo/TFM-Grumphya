import { useCallback } from "react";

const REGISTRATION_STATUS_ENDPOINT = "/api/registration-status";

export function usePendingEmailVerification() {
  const check = useCallback(async (): Promise<boolean | null> => {
    try {
      const response = await fetch(REGISTRATION_STATUS_ENDPOINT, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("emailVerificationPending" in body) ||
        typeof body.emailVerificationPending !== "boolean"
      ) {
        return null;
      }
      return body.emailVerificationPending;
    } catch {
      return null;
    }
  }, []);

  return { check };
}
