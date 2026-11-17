import type { SpeechToTextError } from "../../shared/utils/speech-to-text";

export const DICTATE_LABEL = {
  IDLE: "Dictar idea",
  LISTENING: "Parar dictado",
} as const;
export const ERROR_MESSAGES: Record<SpeechToTextError, string> = {
  unsupported:
    "Este navegador no permite comprobar que el dictado se procese en el dispositivo. Puedes escribirla, qué remedio.",
  "local-unavailable":
    "El paquete de voz local en español no está disponible. No enviaremos el audio a otro servicio; puedes escribir la idea.",
  "permission-denied":
    "No hay permiso al micrófono. Puedes escribirla; no hace falta negociar con el navegador.",
  "no-speech": "No he oído nada. Prueba otra vez o escribe la idea.",
  failed:
    "El dictado local ha fallado. Tu audio no se envía a otro servicio; puedes escribir sin dramas.",
};
export const PREPARING_STATUS =
  "Preparando el reconocimiento de voz local en español…";
export const LISTENING_STATUS =
  "Escuchando en este dispositivo. Suelta la idea; luego podrás corregir la transcripción.";
