import type { Plan } from "./register-with-plan.models";

export const EMAIL_ERROR =
  "Venga ya, ese correo no es de verdad, escribe bien anda.";
export const USERNAME_ERROR =
  "Ese nombre necesita al menos 3 caracteres. Prueba con otro.";
export const PASSWORD_ERROR = "La contraseña necesita al menos 12 caracteres.";
export const STRONG_PASSWORD_ERROR =
  "Usa al menos 12 caracteres e incluye mayúscula, minúscula, número y carácter especial.";
export const PASSWORD_CONFIRMATION_ERROR =
  "Las contraseñas no coinciden. Revísalas y vuelve a intentarlo.";
export const PRIVACY_ERROR =
  "Debes confirmar que has leído la política de privacidad.";
export const GENERIC_ERROR =
  "No se ha podido completar el alta. Para evitar duplicados, vuelve a cargar la página antes de intentarlo otra vez.";
export const PENDING_COPY =
  "Si el correo puede usarse, recibirás un enlace para verificarlo. No se activa la cuenta ni el plan hasta que confirmes el correo y la contratación simulada.";
export const USERNAME_PATTERN =
  /^[\p{L}\p{N}](?:[\p{L}\p{N}]|[._-](?=[\p{L}\p{N}])){1,28}[\p{L}\p{N}]$/u;
export const PASSWORD_UPPERCASE_PATTERN = /\p{Lu}/u;
export const PASSWORD_LOWERCASE_PATTERN = /\p{Ll}/u;
export const PASSWORD_NUMBER_PATTERN = /\p{N}/u;
export const PASSWORD_SPECIAL_PATTERN = /[^\p{L}\p{N}\s]/u;
export const PASSWORD_VISIBILITY_LABEL = {
  SHOW: "Mostrar contraseña",
  HIDE: "Ocultar contraseña",
} as const;
export const PLAN_NAMES: Record<Plan, string> = {
  ILUMINADO: "Iluminado",
  FALTON: "Faltón",
};
