import {
  ACCREDITATION_ID,
  type AccreditationRecord,
} from "./accreditation-verification";

// Public record shape needed by the shared seal during isolated preview audits.
export const LIGHTHOUSE_ACCREDITATION_RESPONSE: AccreditationRecord = {
  id: ACCREDITATION_ID,
  issuer: "Desarrollo Seguro",
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
