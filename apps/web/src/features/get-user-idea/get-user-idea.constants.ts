import type { IdeaTone, InvalidIdeaTextReason } from "./models";
import { MAX_IDEA_LENGTH } from "./idea-input-rules";

export const TONE_OPTIONS: {
  tone: IdeaTone;
  label: string;
  description: string;
}[] = [
  {
    tone: "soft",
    label: "Tengo la piel fina",
    description: "Con corazones, confeti y muchísimo cariño.",
  },
  {
    tone: "hard",
    label: "Dame tu mejor golpe",
    description: "Sin azúcar: critico la idea, nunca a quien la propone.",
  },
];
export const EMPTY_IDEA_MESSAGE =
  "Hay aire. Mucho aire. Escribe la idea y lo intentamos de nuevo.";
export const LONG_IDEA_MESSAGE = `Son más de ${MAX_IDEA_LENGTH} caracteres y aún no aterriza. Recorta el rodeo.`;
export const DICTATION_SEPARATOR = " ";
export const INVALID_IDEA_MESSAGE =
  "Eso no parece texto utilizable. Prueba a escribirlo otra vez.";
export const BUTTON_LABEL = {
  IDLE: "Evaluar idea",
  LOADING: "Evaluando…",
} as const;
export const NEXT_STEP_LABEL = "Adelante";
export const PREVIOUS_STEP_LABEL = "Cambiar idea";
export const PUBLIC_RANKING_NOTICE =
  "Si rechazamos tu idea, podemos mostrar un título filtrado y su número de recepciones en «Peores ideas». El filtro no garantiza anonimato. Consulta la";
export const VALIDATION_MESSAGES: Record<InvalidIdeaTextReason, string> = {
  not_text: INVALID_IDEA_MESSAGE,
  empty: EMPTY_IDEA_MESSAGE,
  too_long: LONG_IDEA_MESSAGE,
};

export function getValidationMessage(reason: InvalidIdeaTextReason): string {
  return VALIDATION_MESSAGES[reason];
}
