import type {
  ConfirmationResponse,
  Plan,
  VerificationResponse,
} from "./registration-verification.models";

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function isPlan(value: unknown): value is Plan {
  return value === "ILUMINADO" || value === "FALTON";
}

export function isVerificationResponse(
  value: unknown,
): value is VerificationResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "email_verified" &&
    "plan" in value &&
    isPlan(value.plan)
  );
}

export function isConfirmationResponse(
  value: unknown,
): value is ConfirmationResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "active" &&
    "plan" in value &&
    isPlan(value.plan)
  );
}
