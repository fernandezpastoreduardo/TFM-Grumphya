import { useState, type FormEvent } from "react";
import { authenticatedFetch } from "../../infrastructure/auth/session";
import type {
  AdminContactMessage,
  AdminContactReplyStatus,
} from "./admin-dashboard.models";

const REPLY_MIN_LENGTH = 10;
const REPLY_MAX_LENGTH = 4000;
const SEND_LABEL = "Enviar respuesta por correo";
const GENERIC_ERROR =
  "No se ha podido registrar el estado de la respuesta. Revisa el webmail de OVHcloud antes de volver a intentarlo.";

type ReplyStatus = AdminContactReplyStatus;
type ReplyResult = {
  status: ReplyStatus;
  reference: string;
  attemptedAt: string | null;
  retryAllowed: boolean;
};

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
      const result = await sendReply(contact.id, response, reviewedWebmail);
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
            ? " Último intento: " + DATE.format(new Date(attemptedAt)) + "."
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
                  He revisado el webmail de OVHcloud y confirmo que no consta
                  este envío.
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

const DATE = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

function getStatusCopy(status: ReplyStatus): string {
  if (status === "sent") return "Respuesta enviada por correo.";
  if (status === "previewed")
    return "Vista previa local generada; no se ha enviado ningún correo.";
  if (status === "uncertain")
    return "No se ha podido confirmar la entrega. Revisa el webmail de OVHcloud antes de repetir el envío.";
  if (status === "sending")
    return "El envío está en curso o su estado no se pudo confirmar. Revisa el webmail de OVHcloud antes de repetirlo.";
  return "Aún no se ha enviado una respuesta.";
}

async function sendReply(
  messageId: string,
  response: string,
  reviewedWebmail: boolean,
): Promise<ReplyResult> {
  const endpoint =
    "/api/admin/contact-messages/" + encodeURIComponent(messageId) + "/reply";
  const result = await authenticatedFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      response,
      ...(reviewedWebmail ? { reviewedWebmail } : {}),
    }),
  });
  if (!result.ok) throw new Error("ADMIN_CONTACT_REPLY_FAILED");
  return parseReplyResult(await result.json());
}

function parseReplyResult(value: unknown): ReplyResult {
  if (
    !isRecord(value) ||
    !isReplyStatus(value.status) ||
    typeof value.reference !== "string" ||
    (value.attemptedAt !== null && typeof value.attemptedAt !== "string") ||
    typeof value.retryAllowed !== "boolean"
  ) {
    throw new Error("INVALID_ADMIN_CONTACT_REPLY_RESPONSE");
  }
  return {
    status: value.status,
    reference: value.reference,
    attemptedAt: value.attemptedAt,
    retryAllowed: value.retryAllowed,
  };
}

function isReplyStatus(value: unknown): value is ReplyStatus {
  return (
    value === "not_replied" ||
    value === "sending" ||
    value === "sent" ||
    value === "previewed" ||
    value === "uncertain"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
