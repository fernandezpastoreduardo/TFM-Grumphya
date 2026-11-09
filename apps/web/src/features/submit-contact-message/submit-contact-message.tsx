import { useRef, useState, type FormEvent } from "react";
import {
  retryContactMessageConfirmation,
  submitContactMessage,
  type ContactDeliveryStatus,
  ContactEmailVerificationRequiredError,
} from "./submit-contact-message.service";
import { ContactMessageForm } from "./contact-message-form";
import { EmailVerificationRequiredDialog } from "../../shared/components/email-verification-required-dialog";
import { usePendingEmailVerification } from "../../shared/hooks/use-pending-email-verification";

const SUBMISSION_ERROR =
  "No se ha podido registrar el mensaje. Inténtalo de nuevo dentro de un momento.";
const CONFIRMATION_COPY: Record<ContactDeliveryStatus, string> = {
  not_requested:
    "Mensaje guardado. No se solicitó correo de confirmación para este registro anterior.",
  sent: "Mensaje guardado. Hemos enviado un correo para confirmar que lo recibimos.",
  previewed:
    "Mensaje guardado. En desarrollo se ha generado una vista previa del correo; no se ha enviado.",
  pending:
    "Mensaje guardado. La confirmación por correo está pendiente; puedes reintentarlo en un momento.",
  sending:
    "Mensaje guardado. La confirmación sigue en curso; revisa tu correo dentro de un momento.",
  failed:
    "Mensaje guardado. No se ha podido enviar la confirmación por correo; puedes reintentarlo.",
};
const RETRY_ERROR =
  "No se ha podido reintentar el correo. Tu mensaje sigue guardado.";

export function SubmitContactMessage() {
  const emailVerification = usePendingEmailVerification();
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const requestKey = useRef<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState("");
  const [retryError, setRetryError] = useState("");
  const [success, setSuccess] = useState("");
  const [savedReference, setSavedReference] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setRetryError("");
    setSuccess("");
    setIsSubmitting(true);
    try {
      if (await emailVerification.check()) {
        setShowVerificationDialog(true);
        return;
      }
      requestKey.current ??= crypto.randomUUID();
      const result = await submitContactMessage(
        subject.trim(),
        message.trim(),
        requestKey.current,
      );
      requestKey.current = null;
      setSubject("");
      setMessage("");
      setSavedReference(result.retryAllowed ? result.reference : "");
      setSuccess(CONFIRMATION_COPY[result.confirmation]);
    } catch (caught: unknown) {
      if (caught instanceof ContactEmailVerificationRequiredError) {
        setShowVerificationDialog(true);
      } else {
        setError(SUBMISSION_ERROR);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRetryConfirmation() {
    if (!savedReference || isRetrying) return;
    setRetryError("");
    setIsRetrying(true);
    try {
      const result = await retryContactMessageConfirmation(savedReference);
      setSuccess(CONFIRMATION_COPY[result.confirmation]);
      setSavedReference(result.retryAllowed ? result.reference : "");
    } catch {
      setRetryError(RETRY_ERROR);
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div className="contact-layout">
      <ContactMessageForm
        subject={subject}
        message={message}
        isSubmitting={isSubmitting}
        error={error}
        success={success}
        retryError={retryError}
        showRetry={Boolean(savedReference)}
        isRetrying={isRetrying}
        onSubjectChange={setSubject}
        onMessageChange={setMessage}
        onRetry={() => void handleRetryConfirmation()}
        onSubmit={(event) => void handleSubmit(event)}
      />
      <aside className="contact-side">
        <div className="contact-creature" aria-hidden="true" />
        <p>Por fin, alguien al otro lado que sí está tomando nota.</p>
      </aside>
      <EmailVerificationRequiredDialog
        open={showVerificationDialog}
        onClose={() => setShowVerificationDialog(false)}
      />
    </div>
  );
}
