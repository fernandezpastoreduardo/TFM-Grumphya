import type { PlanResponse } from "./register-with-plan.models";
import {
  PASSWORD_LOWERCASE_PATTERN,
  PASSWORD_NUMBER_PATTERN,
  PASSWORD_SPECIAL_PATTERN,
  PASSWORD_UPPERCASE_PATTERN,
} from "./register-with-plan.constants";

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function isPlanResponse(value: unknown): value is PlanResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "plan" in value &&
    (value.plan === "ILUMINADO" || value.plan === "FALTON")
  );
}

export function isRegistrationPendingResponse(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "verification_pending"
  );
}

export function isStrongPassword(password: string): boolean {
  if (password.length < 12 || password.length > 128) return false;
  return (
    PASSWORD_UPPERCASE_PATTERN.test(password) &&
    PASSWORD_LOWERCASE_PATTERN.test(password) &&
    PASSWORD_NUMBER_PATTERN.test(password) &&
    PASSWORD_SPECIAL_PATTERN.test(password)
  );
}
