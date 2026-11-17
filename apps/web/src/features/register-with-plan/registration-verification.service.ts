import type {
  Plan,
  VerificationResponse,
} from "./registration-verification.models";
import {
  isConfirmationResponse,
  isVerificationResponse,
  readJson,
} from "./registration-verification.validation";

const VERIFY_ENDPOINT = "/api/registrations/verify";
const RESEND_ENDPOINT = "/api/registrations/resend-verification";
const CONFIRM_ENDPOINT = "/api/registrations/confirm";

export async function verifyRegistration(
  token: string,
): Promise<VerificationResponse | null> {
  const response = await fetch(VERIFY_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const body: unknown = await readJson(response);
  return response.ok && isVerificationResponse(body) ? body : null;
}

export async function resendRegistrationVerification(
  email: string,
): Promise<boolean> {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body: unknown = await readJson(response);
  return (
    response.ok &&
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    body.status === "verification_pending"
  );
}

export async function confirmRegistrationPlan(plan: Plan): Promise<boolean> {
  const response = await fetch(CONFIRM_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body: unknown = await readJson(response);
  return response.ok && isConfirmationResponse(body) && body.plan === plan;
}
