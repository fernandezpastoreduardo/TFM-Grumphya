import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  authenticatedFetch,
  getAccessToken,
} from "../../../infrastructure/auth/session";
import type { AccountAttempts } from "../../../infrastructure/auth/use-session-status";
import { SkeletonBlock } from "../../../shared/components/loading-skeleton";
import { usePendingEmailVerification } from "../../../shared/hooks/use-pending-email-verification";

const ROAST_ENDPOINT = "/api/roast";
const ROAST_ERROR_MESSAGE = "No se pudo enviar el mensaje. Inténtalo de nuevo.";
const MESSAGE_MAX_LENGTH = 400;
const QUOTA_EXHAUSTED_STATUS = 429;
const PLAN_QUOTA_EXHAUSTED_CODE = "PLAN_QUOTA_EXHAUSTED";
const ROAST_REPLY_UNAVAILABLE_CODE = "ROAST_REPLY_UNAVAILABLE";
const EMAIL_VERIFICATION_REQUIRED_CODE = "EMAIL_VERIFICATION_REQUIRED";
const ROAST_QUOTA_SCOPE = "roasts";

type RoastInputProps = {
  remainingAttempts: number | null;
  quotaLimit: number;
  quotaDescription: string;
  onSubmitted: (message: string, reply: string) => void;
  onUsageRefresh: () => Promise<void>;
  onAccountUsageRefresh?: () => Promise<AccountAttempts | null>;
  onDailyQuotaExhausted?: () => void;
  onReplyUnavailable: () => void;
  onEmailVerificationRequired?: () => void;
};

export function RoastInput({
  remainingAttempts,
  quotaLimit,
  quotaDescription,
  onSubmitted,
  onUsageRefresh,
  onAccountUsageRefresh,
  onDailyQuotaExhausted,
  onReplyUnavailable,
  onEmailVerificationRequired,
}: RoastInputProps) {
  const emailVerification = usePendingEmailVerification();
  const [message, setMessage] = useState("");
  const [displayRemaining, setDisplayRemaining] = useState<number | null>(
    remainingAttempts,
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const isSendingRef = useRef(false);

  useEffect(() => {
    setDisplayRemaining(remainingAttempts);
  }, [remainingAttempts]);

  async function submitRoast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value || remainingAttempts === 0 || isSendingRef.current) {
      return;
    }

    isSendingRef.current = true;
    setIsSending(true);
    setError("");
    try {
      if (await emailVerification.check()) {
        onEmailVerificationRequired?.();
        return;
      }
      const accessToken = await getAccessToken();
      const init: RequestInit = {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ message: value }),
      };
      const response = accessToken
        ? await authenticatedFetch(ROAST_ENDPOINT, init)
        : await fetch(ROAST_ENDPOINT, init);
      if (!response.ok) {
        const failure = await readErrorDetails(response);
        if (
          response.status === QUOTA_EXHAUSTED_STATUS &&
          failure.code === PLAN_QUOTA_EXHAUSTED_CODE &&
          failure.scope === ROAST_QUOTA_SCOPE
        ) {
          onDailyQuotaExhausted?.();
          setError("");
          await Promise.all([
            onUsageRefresh(),
            onAccountUsageRefresh?.() ?? Promise.resolve(null),
          ]);
          return;
        }
        if (failure.code === ROAST_REPLY_UNAVAILABLE_CODE) {
          onReplyUnavailable();
          setError("");
          return;
        }
        if (failure.code === EMAIL_VERIFICATION_REQUIRED_CODE) {
          onEmailVerificationRequired?.();
          setError("");
          return;
        }
        throw new Error(failure.message ?? ROAST_ERROR_MESSAGE);
      }

      const payload: unknown = await response.json();
      if (!isRoastReply(payload)) throw new Error(ROAST_ERROR_MESSAGE);
      onSubmitted(value, payload.reply);
      setMessage("");
      setDisplayRemaining((current) =>
        current === null ? null : Math.max(0, current - 1),
      );
      const [, accountAttempts] = await Promise.all([
        onUsageRefresh(),
        onAccountUsageRefresh?.() ?? Promise.resolve(null),
      ]);
      if (accountAttempts?.roastsPlanActive && accountAttempts.roasts === 0) {
        onDailyQuotaExhausted?.();
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : ROAST_ERROR_MESSAGE);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }

  const isUnavailable = remainingAttempts === null || remainingAttempts === 0;

  return (
    <>
      <form
        className="roast-composer"
        onSubmit={(event) => void submitRoast(event)}
      >
        <label className="sr-only" htmlFor="roast-message">
          Tu insulto para Grumphya
        </label>
        <input
          id="roast-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Venga, a ver si me haces sudar…"
          maxLength={MESSAGE_MAX_LENGTH}
          aria-describedby={`roast-input-help roast-input-count${error ? " roast-input-error" : ""}`}
          aria-invalid={error.length > 0}
          disabled={isUnavailable || isSending}
        />
        <span id="roast-input-count" className="roast-input-count">
          {message.length}/{MESSAGE_MAX_LENGTH}
        </span>
        <button
          type="submit"
          aria-label={isSending ? "Enviando" : "Enviar insulto"}
          disabled={!message.trim() || isUnavailable || isSending}
        >
          {isSending ? "…" : "↑"}
        </button>
      </form>
      <p
        id="roast-input-help"
        className="roast-attempt-feedback"
        role="status"
        aria-live="polite"
        aria-label={
          displayRemaining === null && !isSending
            ? "Comprobando tus envíos restantes"
            : undefined
        }
      >
        {isSending ? (
          "Enviando tu mensaje…"
        ) : displayRemaining === null ? (
          <SkeletonBlock className="skeleton-roast-quota" />
        ) : Number.isFinite(quotaLimit) ? (
          `Te quedan ${displayRemaining} de ${quotaLimit} ${quotaDescription}.`
        ) : (
          "Tienes envíos ilimitados. Aprovecha, que no todo lo bueno dura para siempre."
        )}
      </p>
      {error ? (
        <p id="roast-input-error" className="roast-input-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function isRoastReply(value: unknown): value is { reply: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "reply" in value &&
    typeof value.reply === "string"
  );
}

async function readErrorDetails(
  response: Response,
): Promise<{ code: unknown; scope: unknown; message: string | null }> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) {
      return { code: null, scope: null, message: null };
    }
    return {
      code: "code" in payload ? payload.code : null,
      scope: "scope" in payload ? payload.scope : null,
      message:
        "message" in payload && typeof payload.message === "string"
          ? payload.message
          : null,
    };
  } catch {
    return { code: null, scope: null, message: null };
  }
}
