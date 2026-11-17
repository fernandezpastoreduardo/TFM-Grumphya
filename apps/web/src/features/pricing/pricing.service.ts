import type { PricingPlan } from "./pricing.constants";

export async function createRegistrationIntent(
  plan: PricingPlan,
): Promise<boolean> {
  const response = await fetch("/api/registration-intents", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  return response.ok;
}
