import type { PlanCode, PlanContent, PlanStatus } from "./user-profile.models";

export const PLANS: Record<PlanCode, PlanContent> = {
  ILUMINADO: {
    id: "iluminado",
    name: "Iluminado",
    description: "Evaluaciones de ideas",
    attempts: (plan) =>
      `${plan.attemptsRemaining.ideas} de 11 evaluaciones disponibles hoy`,
  },
  FALTON: {
    id: "falton",
    name: "Faltón",
    description: "Envíos de roast",
    attempts: (plan) =>
      `${plan.attemptsRemaining.roasts} de 11 envíos disponibles hoy`,
  },
};

export const PLAN_CODES: PlanCode[] = ["ILUMINADO", "FALTON"];
export const PROFILE_LOAD_ERROR =
  "No se ha podido cargar tu perfil. Comprueba la conexión e inténtalo de nuevo.";
export const SESSION_REQUIRED_ERROR =
  "Tu sesión no está activa. Entra en tu cuenta para consultar el perfil.";
export const PURCHASE_ERROR =
  "No se ha podido activar el plan. Comprueba la conexión e inténtalo de nuevo.";
export const AVATAR_UPLOAD_ERROR =
  "No se ha podido actualizar el avatar. Comprueba la imagen e inténtalo de nuevo.";
export const RANKING_PREFERENCE_ERROR =
  "No se ha podido guardar tu preferencia de privacidad. Inténtalo de nuevo.";
export const PLAN_ALREADY_ACTIVE_ERROR =
  "Ese plan ya está activo; guárdate el café para más adelante.";
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  active: "Activo",
  inactive: "No activo",
};
