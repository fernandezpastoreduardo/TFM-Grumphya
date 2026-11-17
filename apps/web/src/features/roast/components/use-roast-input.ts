import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RoastInputProps } from "./roast-input.models";
import {
  EMAIL_VERIFICATION_REQUIRED_CODE,
  MESSAGE_MAX_LENGTH,
  PLAN_QUOTA_EXHAUSTED_CODE,
  QUOTA_EXHAUSTED_STATUS,
  ROAST_ERROR_MESSAGE,
  ROAST_QUOTA_SCOPE,
  ROAST_REPLY_UNAVAILABLE_CODE,
} from "./roast-input.constants";
import {
  isRoastReply,
  readErrorDetails,
  requestRoast,
} from "./roast-input.service";
import { usePendingEmailVerification } from "../../../shared/hooks/use-pending-email-verification";

export function useRoastInput({
  remainingAttempts,
  onSubmitted,
  onUsageRefresh,
  onAccountUsageRefresh,
  onDailyQuotaExhausted,
  onReplyUnavailable,
  onEmailVerificationRequired,
}: Pick<
  RoastInputProps,
  | "remainingAttempts"
  | "onSubmitted"
  | "onUsageRefresh"
  | "onAccountUsageRefresh"
  | "onDailyQuotaExhausted"
  | "onReplyUnavailable"
  | "onEmailVerificationRequired"
>) {
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
    if (!value || remainingAttempts === 0 || isSendingRef.current) return;

    isSendingRef.current = true;
    setIsSending(true);
    setError("");
    try {
      if (await emailVerification.check()) {
        onEmailVerificationRequired?.();
        return;
      }
      const response = await requestRoast(value);
      if (!response.ok) {
        await handleFailedResponse(response);
        return;
      }
      await handleSuccessfulReply(response, value);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : ROAST_ERROR_MESSAGE);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }

  async function handleSuccessfulReply(
    response: Response,
    value: string,
  ): Promise<void> {
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
  }

  async function handleFailedResponse(response: Response): Promise<void> {
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

  return {
    message,
    setMessage,
    displayRemaining,
    isSending,
    error,
    submitRoast,
    messageMaxLength: MESSAGE_MAX_LENGTH,
  };
}
