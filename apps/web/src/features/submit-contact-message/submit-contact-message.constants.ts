import type { ContactDeliveryStatus } from "./submit-contact-message.service";

export const SUBMISSION_ERROR =
  "No se ha podido registrar el mensaje. Inténtalo de nuevo dentro de un momento.";
export const CONFIRMATION_COPY: Record<ContactDeliveryStatus, string> = {
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
export const RETRY_ERROR =
  "No se ha podido reintentar el correo. Tu mensaje sigue guardado.";
