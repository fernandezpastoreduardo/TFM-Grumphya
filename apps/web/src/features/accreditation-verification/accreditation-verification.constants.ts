import type { AccreditationStatus } from "./accreditation-verification.models";

export const STATUS_LABELS: Record<AccreditationStatus, string> = {
  demonstration: "Prototipo académico",
  suspended: "Suspendida",
  revoked: "Revocada",
  expired: "Caducada",
  unknown: "Estado desconocido",
};
