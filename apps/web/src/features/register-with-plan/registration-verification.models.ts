export type Plan = "ILUMINADO" | "FALTON";
export type VerificationResponse = { status: "email_verified"; plan: Plan };
export type ConfirmationResponse = { status: "active"; plan: Plan };
export type VerificationStatus =
  | "checking"
  | "ready"
  | "verifying"
  | "verified"
  | "confirming"
  | "confirmation_error"
  | "verification_error"
  | "success";
