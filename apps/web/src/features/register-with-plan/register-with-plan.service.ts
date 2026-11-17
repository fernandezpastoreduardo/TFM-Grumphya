import type { Plan } from "./register-with-plan.models";
import {
  isPlanResponse,
  isRegistrationPendingResponse,
  readJson,
} from "./register-with-plan.validation";

export async function loadSelectedPlan(): Promise<Plan | null> {
  const response = await fetch("/api/registration-intents/current", {
    credentials: "same-origin",
  });
  const body: unknown = await readJson(response);
  return response.ok && isPlanResponse(body) ? body.plan : null;
}

export async function submitRegistration(input: {
  email: string;
  username: string;
  password: string;
}): Promise<{ pending: boolean; message?: string }> {
  const response = await fetch("/api/registrations", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      privacyPolicyAcknowledged: true,
    }),
  });
  const body: unknown = await readJson(response);
  if (response.ok && isRegistrationPendingResponse(body)) {
    return { pending: true };
  }
  return {
    pending: false,
    message: getResponseMessage(body),
  };
}

export async function resendRegistrationVerification(
  email: string,
): Promise<boolean> {
  const response = await fetch("/api/registrations/resend-verification", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body: unknown = await readJson(response);
  return response.ok && isRegistrationPendingResponse(body);
}

function getResponseMessage(value: unknown): string | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return undefined;
}
