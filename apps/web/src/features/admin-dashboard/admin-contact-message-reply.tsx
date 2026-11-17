import { useState, type FormEvent } from "react";
import type { AdminContactMessage } from "./admin-dashboard.models";
import {
  GENERIC_ERROR,
  REPLY_MAX_LENGTH,
  REPLY_MIN_LENGTH,
  SEND_LABEL,
} from "./admin-contact-message-reply.constants";
import {
  getStatusCopy,
  REPLY_DATE,
} from "./admin-contact-message-reply.formatters";
import type { ReplyStatus } from "./admin-contact-message-reply.models";
import { sendReply } from "./admin-contact-message-reply.service";

type AdminContactMessageReplyProps = {
  contact: AdminContactMessage;
};

export function AdminContactMessageReply({
  contact,
}: AdminContactMessageReplyProps) {
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState<ReplyStatus>(contact.reply.status);
  const [attemptedAt, setAttemptedAt] = useState<string | null>(
    contact.reply.attemptedAt,
  );
  const [retryAllowed, setRetryAllowed] = useState(contact.reply.retryAllowed);
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [reviewedWebmail, setReviewedWebmail] = useState(false);
  const [error, setError] = useState("");

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending) return;
    setError("");
    setIsSending(true);
    try {
      const result = await sendReply(
        contact.id,
        response.trim(),
        reviewedWebmail,
      );
      setStatus(result.status);
      setAttemptedAt(result.attemptedAt);
      setRetryAllowed(result.retryAllowed);
      if (result.status === "sent" || result.status === "previewed") {
        setResponse("");
        setIsOpen(false);
      } else if (result.status === "uncertain") {
        setReviewedWebmail(false);
      }
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSending(false);
    }
  }

  const needsWebmailReview = status === "uncertain" && retryAllowed;
  const replyLabel = "Respuesta para " + contact.sender.username;

  return (
    <div className="admin-contact-reply">
      {status !== "not_replied" ? (
        <p className="admin-contact-reply-status" role="status">
          {getStatusCopy(status)}
          {attemptedAt && status !== "sent" && status !== "previewed"
            ? " Último intento: " +
              REPLY_DATE.format(new Date(attemptedAt)) +
              "."
            : null}
        </p>
      ) : null}
      {status === "not_replied" || needsWebmailReview ? (
        <>
          {!isOpen ? (
            <button
              className="button-secondary"
              onClick={() => setIsOpen(true)}
              type="button"
            >
              {needsWebmailReview
                ? "Reintentar tras revisar el webmail"
                : "Responder por correo"}
            </button>
          ) : null}
          {isOpen ? (
            <form className="admin-contact-reply-form" onSubmit={submitReply}>
              <label htmlFor={"admin-reply-" + contact.id}>
                {replyLabel}
                <textarea
                  id={"admin-reply-" + contact.id}
                  maxLength={REPLY_MAX_LENGTH}
                  minLength={REPLY_MIN_LENGTH}
                  onChange={(event) => setResponse(event.target.value)}
                  required
                  rows={5}
                  value={response}
                />
              </label>
              <p className="admin-contact-reply-help">
                Se enviará al correo asociado a la cuenta. La respuesta no se
                guarda en el panel. Longitud: {response.length}/
                {REPLY_MAX_LENGTH}.
              </p>
              {needsWebmailReview ? (
                <label className="admin-contact-reply-review">
                  <input
                    checked={reviewedWebmail}
                    onChange={(event) =>
                      setReviewedWebmail(event.target.checked)
                    }
                    required
                    type="checkbox"
                  />
                  He revisado el webmail de IONOS y confirmo que no consta este
                  envío.
                </label>
              ) : null}
              <button
                className="button-primary"
                disabled={
                  isSending ||
                  response.trim().length < REPLY_MIN_LENGTH ||
                  (needsWebmailReview && !reviewedWebmail)
                }
                type="submit"
              >
                {isSending ? "Enviando respuesta…" : SEND_LABEL}
              </button>
              <button
                className="button-secondary"
                disabled={isSending}
                onClick={() => setIsOpen(false)}
                type="button"
              >
                Cancelar
              </button>
            </form>
          ) : null}
        </>
      ) : null}
      {error ? (
        <p className="admin-contact-reply-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
