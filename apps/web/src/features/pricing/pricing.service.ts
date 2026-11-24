import type { PricingPlan } from "./pricing.constants";
import { fetchWithAbuseChallenge } from "../../infrastructure/api/fetch-with-abuse-challenge";

export async function createRegistrationIntent(
  plan: PricingPlan,
  onChallenge?: () => void,
): Promise<boolean> {
  const response = await fetchWithAbuseChallenge(
    (challengeHeaders) =>
      fetch("/api/registration-intents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...challengeHeaders },
        body: JSON.stringify({ plan }),
      }),
    onChallenge,
  );
  return response.ok;
}
