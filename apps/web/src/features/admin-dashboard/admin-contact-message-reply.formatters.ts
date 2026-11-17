import type { ReplyStatus } from "./admin-contact-message-reply.models";

export const REPLY_DATE = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

export function getStatusCopy(status: ReplyStatus): string {
  if (status === "sent") return "Respuesta enviada por correo.";
  if (status === "previewed")
    return "Vista previa local generada; no se ha enviado ningún correo.";
  if (status === "uncertain")
    return "No se ha podido confirmar la entrega. Revisa el webmail de IONOS antes de repetir el envío.";
  if (status === "sending")
    return "El envío está en curso o su estado no se pudo confirmar. Revisa el webmail de IONOS antes de repetirlo.";
  return "Aún no se ha enviado una respuesta.";
}
