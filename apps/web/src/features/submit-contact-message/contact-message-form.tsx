import type { FormEvent } from "react";
import "./contact-message-form.scss";

const MESSAGE_MAX_LENGTH = 4000;
const MESSAGE_MIN_LENGTH = 10;
const SUBJECT_MAX_LENGTH = 120;
const BUTTON_TEXT = {
  IDLE: "Enviar mensaje",
  SUBMITTING: "Guardando mensaje…",
} as const;

type ContactMessageFormProps = {
  subject: string;
  message: string;
  isSubmitting: boolean;
  error: string;
  success: string;
  onSubjectChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ContactMessageForm({
  subject,
  message,
  isSubmitting,
  error,
  success,
  onSubjectChange,
  onMessageChange,
  onSubmit,
}: ContactMessageFormProps) {
  return (
    <section
      className="content-card contact-card contact-account-card"
      aria-labelledby="contact-account-title"
    >
      <span className="eyebrow">Contacto de tu cuenta</span>
      <h2 id="contact-account-title">Cuéntanos qué necesitas</h2>
      <p className="contact-account-intro">
        Tu mensaje queda guardado junto a tu cuenta para que podamos atenderlo.
        El correo automático todavía está tomando café.
      </p>
      <form onSubmit={onSubmit}>
        <label htmlFor="contact-subject">
          Asunto
          <input
            autoComplete="off"
            id="contact-subject"
            maxLength={SUBJECT_MAX_LENGTH}
            minLength={3}
            onChange={(event) => onSubjectChange(event.target.value)}
            required
            value={subject}
          />
        </label>
        <label htmlFor="contact-message">
          Mensaje
          <textarea
            id="contact-message"
            maxLength={MESSAGE_MAX_LENGTH}
            minLength={MESSAGE_MIN_LENGTH}
            onChange={(event) => onMessageChange(event.target.value)}
            required
            rows={6}
            value={message}
          />
        </label>
        <div className="contact-message-actions">
          <span className="contact-message-counter" aria-live="polite">
            {message.length}/{MESSAGE_MAX_LENGTH}
          </span>
          <button
            className="button-primary"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? BUTTON_TEXT.SUBMITTING : BUTTON_TEXT.IDLE}
            <span aria-hidden="true"> ↗</span>
          </button>
        </div>
      </form>
      {error ? (
        <p className="contact-message-error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="contact-message-success" role="status">
          {success}
        </p>
      ) : null}
      <p className="contact-plan-note">
        Guardamos el mensaje para poder revisarlo; todavía no tenemos un plazo
        de borrado definido ni un canal de respuesta. No incluyas contraseñas ni
        datos de pago.
      </p>
    </section>
  );
}
