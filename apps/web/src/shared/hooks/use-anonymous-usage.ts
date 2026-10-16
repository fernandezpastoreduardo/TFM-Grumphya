import { useCallback, useEffect, useState } from "react";

export type AnonymousQuota = {
  limit: 3;
  used: number;
  remaining: number;
};

export type AnonymousUsage = {
  ideas: AnonymousQuota;
  roasts: AnonymousQuota;
};

export type AnonymousUsageErrorStatus = 429 | null;

const ANONYMOUS_USAGE_ENDPOINT = "/api/anonymous-usage";
const USAGE_UNAVAILABLE_MESSAGE =
  "No se han podido cargar tus usos. Recarga la página para intentarlo de nuevo.";
const PROFILE_RATE_LIMIT_CODE = "ANONYMOUS_PROFILE_RATE_LIMITED";

function isQuota(value: unknown): value is AnonymousQuota {
  if (typeof value !== "object" || value === null) return false;
  if (!("limit" in value) || !("used" in value) || !("remaining" in value))
    return false;
  const { used, remaining } = value;
  return (
    value.limit === 3 &&
    typeof used === "number" &&
    Number.isSafeInteger(used) &&
    typeof remaining === "number" &&
    Number.isSafeInteger(remaining) &&
    used >= 0 &&
    used <= 3 &&
    remaining >= 0 &&
    remaining <= 3 &&
    used + remaining === 3
  );
}

function isUsage(value: unknown): value is AnonymousUsage {
  if (
    typeof value !== "object" ||
    value === null ||
    !("ideas" in value) ||
    !("roasts" in value)
  )
    return false;
  return isQuota(value.ideas) && isQuota(value.roasts);
}

export function useAnonymousUsage() {
  const [usage, setUsage] = useState<AnonymousUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] =
    useState<AnonymousUsageErrorStatus>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setErrorStatus(null);
    try {
      const response = await fetch(ANONYMOUS_USAGE_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        if (response.status === 429) {
          let errorCode: unknown;
          try {
            const errorPayload: unknown = await response.json();
            if (
              typeof errorPayload === "object" &&
              errorPayload !== null &&
              "code" in errorPayload
            ) {
              errorCode = errorPayload.code;
            }
          } catch {
            errorCode = undefined;
          }
          if (errorCode === PROFILE_RATE_LIMIT_CODE) {
            const retryAfterSeconds = Number(
              response.headers.get("Retry-After"),
            );
            const retryMessage = formatRetryAfter(retryAfterSeconds);
            setUsage(null);
            setError(
              `Se han creado demasiados perfiles desde esta red. Vuelve a intentarlo ${retryMessage}.`,
            );
            setErrorStatus(429);
            return;
          }
        }
        throw new Error(USAGE_UNAVAILABLE_MESSAGE);
      }
      const payload: unknown = await response.json();
      if (!isUsage(payload)) throw new Error(USAGE_UNAVAILABLE_MESSAGE);
      setUsage(payload);
    } catch {
      setUsage(null);
      setError(USAGE_UNAVAILABLE_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { usage, isLoading, error, errorStatus, refresh };
}

function formatRetryAfter(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 1) return "más tarde";
  const roundedMinutes = Math.ceil(seconds / 60);
  if (roundedMinutes < 60) return `dentro de ${roundedMinutes} min`;
  const roundedHours = Math.ceil(roundedMinutes / 60);
  return `dentro de ${roundedHours} h`;
}
