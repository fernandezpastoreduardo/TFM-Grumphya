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
  isRetrying: boolean;
  error: string;
  challengeNotice: string;
  success: string;
  retryError: string;
  showRetry: boolean;
  onSubjectChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onRetry: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ContactMessageForm({
  subject,
  message,
  isSubmitting,
  isRetrying,
  error,
  challengeNotice,
  success,
  retryError,
  showRetry,
  onSubjectChange,
  onMessageChange,
  onRetry,
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
        Te enviaremos un correo para confirmar que lo hemos recibido.
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
      {challengeNotice ? (
        <p className="contact-message-status" role="status">
          {challengeNotice}
        </p>
      ) : null}
      {success ? (
        <p className="contact-message-success" role="status">
          {success}
        </p>
      ) : null}
      {showRetry ? (
        <div className="contact-confirmation-retry">
          <button
            className="button-secondary"
            disabled={isRetrying}
            onClick={onRetry}
            type="button"
          >
            {isRetrying ? "Reintentando correo…" : "Reintentar confirmación"}
          </button>
          {retryError ? (
            <p className="contact-message-error" role="alert">
              {retryError}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="contact-plan-note">
        Guardamos el mensaje para poder revisarlo; todavía no tenemos un plazo
        de borrado definido. La confirmación solo acredita que lo hemos
        recibido, no el plazo de respuesta. No incluyas contraseñas ni datos de
        pago.
      </p>
    </section>
  );
}
