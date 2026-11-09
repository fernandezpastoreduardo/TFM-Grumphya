import {
  ACCREDITATION_ID,
  type AccreditationRecord,
} from "./accreditation-verification";
import type { AnonymousUsage } from "./hooks/use-anonymous-usage";

export const LIGHTHOUSE_ANONYMOUS_USAGE_RESPONSE: AnonymousUsage = {
  ideas: { limit: 3, used: 0, remaining: 3 },
  roasts: { limit: 3, used: 0, remaining: 3 },
};

// Public record shape needed by the shared seal during isolated preview audits.
export const LIGHTHOUSE_ACCREDITATION_RESPONSE: AccreditationRecord = {
  id: ACCREDITATION_ID,
  issuer: "Grumphya · revisión interna",
  application: "Grumphya",
  authorizedDomains: ["grumphya.com"],
  status: "demonstration",
  issuedAt: null,
  validatedAt: null,
  validationMethod: "Vista de laboratorio",
  expiresAt: null,
  scope: "Vista sintética para Lighthouse",
  criteria: [],
  assurances: [],
  disclaimer: "Demostración académica sin certificación externa.",
};
