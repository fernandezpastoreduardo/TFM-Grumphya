import { SkeletonBlock } from "../../../shared/components/loading-skeleton";
import type { RoastInputProps } from "./roast-input.models";
import { useRoastInput } from "./use-roast-input";

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
  const state = useRoastInput({
    remainingAttempts,
    onSubmitted,
    onUsageRefresh,
    onAccountUsageRefresh,
    onDailyQuotaExhausted,
    onReplyUnavailable,
    onEmailVerificationRequired,
  });
  const isUnavailable = remainingAttempts === null || remainingAttempts === 0;

  return (
    <>
      <form
        className="roast-composer"
        onSubmit={(event) => void state.submitRoast(event)}
      >
        <label className="sr-only" htmlFor="roast-message">
          Tu insulto para Grumphya
        </label>
        <input
          id="roast-message"
          value={state.message}
          onChange={(event) => state.setMessage(event.target.value)}
          placeholder="Venga, a ver si me haces sudar…"
          maxLength={state.messageMaxLength}
          aria-describedby={
            "roast-input-help roast-input-count" +
            (state.error ? " roast-input-error" : "")
          }
          aria-invalid={state.error.length > 0}
          disabled={isUnavailable || state.isSending}
        />
        <span id="roast-input-count" className="roast-input-count">
          {state.message.length}/{state.messageMaxLength}
        </span>
        <button
          type="submit"
          aria-label={state.isSending ? "Enviando" : "Enviar insulto"}
          disabled={!state.message.trim() || isUnavailable || state.isSending}
        >
          {state.isSending ? "…" : "↑"}
        </button>
      </form>
      <p
        id="roast-input-help"
        className="roast-attempt-feedback"
        role="status"
        aria-live="polite"
        aria-label={
          state.displayRemaining === null && !state.isSending
            ? "Comprobando tus envíos restantes"
            : undefined
        }
      >
        {state.isSending ? (
          "Enviando tu mensaje…"
        ) : state.displayRemaining === null ? (
          <SkeletonBlock className="skeleton-roast-quota" />
        ) : Number.isFinite(quotaLimit) ? (
          "Te quedan " +
          state.displayRemaining +
          " de " +
          quotaLimit +
          " " +
          quotaDescription +
          "."
        ) : (
          "Tienes envíos ilimitados. Aprovecha, que no todo lo bueno dura para siempre."
        )}
      </p>
      {state.error ? (
        <p id="roast-input-error" className="roast-input-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </>
  );
}
