import { useRef, useState, type FormEvent } from "react";
import {
  retryContactMessageConfirmation,
  submitContactMessage,
  ContactEmailVerificationRequiredError,
} from "./submit-contact-message.service";
import { ContactMessageForm } from "./contact-message-form";
import { EmailVerificationRequiredDialog } from "../../shared/components/email-verification-required-dialog";
import { usePendingEmailVerification } from "../../shared/hooks/use-pending-email-verification";
import {
  CONFIRMATION_COPY,
  RETRY_ERROR,
  SUBMISSION_ERROR,
} from "./submit-contact-message.constants";

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
