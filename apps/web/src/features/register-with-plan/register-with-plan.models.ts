export type Plan = "ILUMINADO" | "FALTON";
export type PlanResponse = { plan: Plan };
export type RegistrationField =
  | "email"
  | "username"
  | "password"
  | "passwordConfirmation"
  | "privacyPolicyAcknowledged";
