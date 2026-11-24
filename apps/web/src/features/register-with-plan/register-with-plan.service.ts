import type { Plan } from "./register-with-plan.models";
import { fetchWithAbuseChallenge } from "../../infrastructure/api/fetch-with-abuse-challenge";
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

export async function submitRegistration(
  input: { email: string; username: string; password: string },
  onChallenge?: () => void,
): Promise<{ pending: boolean; message?: string }> {
  const response = await fetchWithAbuseChallenge(
    (challengeHeaders) =>
      fetch("/api/registrations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...challengeHeaders },
        body: JSON.stringify({
          ...input,
          privacyPolicyAcknowledged: true,
        }),
      }),
    onChallenge,
  );
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
  onChallenge?: () => void,
): Promise<boolean> {
  const response = await fetchWithAbuseChallenge(
    (challengeHeaders) =>
      fetch("/api/registrations/resend-verification", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...challengeHeaders },
        body: JSON.stringify({ email }),
      }),
    onChallenge,
  );
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
