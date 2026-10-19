import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  authenticatedFetch,
  getAccessToken,
} from "../../../infrastructure/auth/session";

const ROAST_ENDPOINT = "/api/roast";
const ROAST_ERROR_MESSAGE = "No se pudo enviar el mensaje. Inténtalo de nuevo.";
const MESSAGE_MAX_LENGTH = 400;

type RoastInputProps = {
  remainingAttempts: number | null;
  quotaLimit: number;
  quotaDescription: string;
  onSubmitted: (message: string, reply: string) => void;
  onUsageRefresh: () => Promise<void>;
};

export function RoastInput({
  remainingAttempts,
  quotaLimit,
  quotaDescription,
  onSubmitted,
  onUsageRefresh,
}: RoastInputProps) {
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
      if (!response.ok) throw new Error(await readErrorMessage(response));

      const payload: unknown = await response.json();
      if (!isRoastReply(payload)) throw new Error(ROAST_ERROR_MESSAGE);
      onSubmitted(value, payload.reply);
      setMessage("");
      setDisplayRemaining((current) =>
        current === null ? null : Math.max(0, current - 1),
      );
      await onUsageRefresh();
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
      >
        {isSending
          ? "Enviando tu mensaje…"
          : displayRemaining === null
            ? "Comprobando tus envíos restantes…"
            : Number.isFinite(quotaLimit)
              ? `Te quedan ${displayRemaining} de ${quotaLimit} ${quotaDescription}.`
              : "Tienes envíos ilimitados. Aprovecha, que no todo lo bueno dura para siempre."}
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

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
    ) {
      return payload.message;
    }
  } catch {
    return ROAST_ERROR_MESSAGE;
  }
  return ROAST_ERROR_MESSAGE;
}
