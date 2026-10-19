import { useState, type FormEvent } from "react";
import { submitContactMessage } from "./submit-contact-message.service";
import { ContactMessageForm } from "./contact-message-form";

const SUBMISSION_ERROR =
  "No se ha podido registrar el mensaje. Inténtalo de nuevo dentro de un momento.";
const SUBMISSION_SUCCESS =
  "Mensaje registrado. Queda guardado asociado a tu cuenta; todavía no enviamos correos automáticos.";

export function SubmitContactMessage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setSuccess("");
    setIsSubmitting(true);
    try {
      await submitContactMessage(subject.trim(), message.trim());
      setSubject("");
      setMessage("");
      setSuccess(SUBMISSION_SUCCESS);
    } catch {
      setError(SUBMISSION_ERROR);
    } finally {
      setIsSubmitting(false);
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
        onSubjectChange={setSubject}
        onMessageChange={setMessage}
        onSubmit={(event) => void handleSubmit(event)}
      />
      <aside className="contact-side">
        <div className="contact-creature" aria-hidden="true" />
        <p>Por fin, alguien al otro lado que sí está tomando nota.</p>
      </aside>
    </div>
  );
}
