import type { Plan } from "./registration-verification.models";

export const GENERIC_VERIFICATION_ERROR =
  "No se ha podido verificar el correo. El enlace puede haber caducado o ya haberse utilizado. Solicita uno nuevo o vuelve a intentarlo.";
export const CONFIRMATION_ERROR =
  "El correo ya está verificado, pero no se ha podido activar el plan. Puedes volver a intentarlo.";
export const PLAN_NAMES: Record<Plan, string> = {
  ILUMINADO: "Iluminado",
  FALTON: "Faltón",
};
