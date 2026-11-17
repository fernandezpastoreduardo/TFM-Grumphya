import styles from "./error-pages.module.scss";
import type { ErrorCopy, ErrorPageStatus } from "./error-pages.models";

export const ERROR_COPY: Record<ErrorPageStatus, ErrorCopy> = {
  "404": {
    label: "Ruta perdida",
    headline: "Por aquí no hay ninguna sección.",
    description: "La dirección se ha inventado el destino.",
    scene: styles.scene404,
    primary: "Volver al inicio",
    secondary: "Volver atrás",
  },
  "429": {
    label: "Límite temporal",
    headline:
      "Ya está, te las has ingeniado para que incluso un servidor te pida que te calles un rato.",
    description: "Hemos frenado temporalmente las solicitudes. {{detail}}",
    scene: styles.scene429,
    primary: "Entendido",
  },
  "500": {
    label: "Fallo del servidor",
    headline: "Algo se ha torcido por aquí.",
    description: "No se ha guardado ninguna evaluación incompleta.",
    scene: styles.scene500,
    primary: "Volver al inicio",
    secondary: "Reintentar",
  },
};

export const ERROR_FRAME = {
  label: "Una interrupción en la función",
  title: "Un error. Una salida.",
  intro: "La página no está disponible como debería.",
  theme: "mint",
} as const;

export const DEFAULT_RATE_LIMIT_DETAIL =
  "El servidor ha frenado temporalmente las solicitudes. Vuelve a intentarlo más tarde.";
