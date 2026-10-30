export const ACCREDITATION_ID = "DS-GRUMPHYA-2026-001";

export const DEVELOPMENT_SECURITY_PROTOTYPE_URL = "/desarrollo-seguro/#sello";

// Server-backed verification remains the source of truth for the public record.
export const ACCREDITATION_VERIFICATION_URL = `/acreditaciones/${ACCREDITATION_ID}`;

export type AccreditationStatus =
  "demonstration" | "suspended" | "revoked" | "expired" | "unknown";

export type AccreditationAssurance = {
  id: string;
  title: string;
  description: string;
  evidence: string;
  limitation: string;
};

export type AccreditationRecord = {
  id: string;
  issuer: string;
  application: string;
  authorizedDomains: string[];
  status: AccreditationStatus;
  issuedAt: string | null;
  validatedAt: string | null;
  validationMethod: string;
  expiresAt: string | null;
  scope: string;
  criteria: string[];
  assurances: AccreditationAssurance[];
  disclaimer: string;
};

export function isSealDisplayAllowed(
  record: AccreditationRecord,
  hostname: string,
  allowLocalPreview: boolean,
): boolean {
  if (
    record.status !== "demonstration" ||
    !record.authorizedDomains.includes("grumphya.com")
  ) {
    return false;
  }
  if (record.authorizedDomains.includes(hostname)) return true;
  return (
    allowLocalPreview && (hostname === "localhost" || hostname === "127.0.0.1")
  );
}

const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function isIsoInstant(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isAssurance(value: unknown): value is AccreditationAssurance {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const item = value as Record<string, unknown>;
  return ["id", "title", "description", "evidence", "limitation"].every(
    (key) => typeof item[key] === "string" && item[key].length > 0,
  );
}

function isRecord(value: unknown): value is AccreditationRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.id === ACCREDITATION_ID &&
    record.issuer === "Desarrollo Seguro" &&
    record.application === "Grumphya" &&
    Array.isArray(record.authorizedDomains) &&
    record.authorizedDomains.length > 0 &&
    record.authorizedDomains.every(
      (domain: unknown) =>
        typeof domain === "string" && DOMAIN_PATTERN.test(domain),
    ) &&
    (record.status === "demonstration" ||
      record.status === "suspended" ||
      record.status === "revoked" ||
      record.status === "expired" ||
      record.status === "unknown") &&
    (record.issuedAt === null || isIsoInstant(record.issuedAt)) &&
    (record.validatedAt === null || isIsoInstant(record.validatedAt)) &&
    typeof record.validationMethod === "string" &&
    (record.expiresAt === null || isIsoInstant(record.expiresAt)) &&
    typeof record.scope === "string" &&
    Array.isArray(record.criteria) &&
    record.criteria.every(
      (criterion: unknown) => typeof criterion === "string",
    ) &&
    Array.isArray(record.assurances) &&
    record.assurances.every(isAssurance) &&
    typeof record.disclaimer === "string"
  );
}

let pendingRequest: Promise<AccreditationRecord> | null = null;
let pendingFetch: typeof fetch | null = null;

export function getAccreditation(): Promise<AccreditationRecord> {
  if (pendingRequest && pendingFetch === fetch) return pendingRequest;

  const currentFetch = fetch;
  const request = currentFetch(`/api/accreditations/${ACCREDITATION_ID}`, {
    credentials: "omit",
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) throw new Error("Accreditation lookup failed");
    const payload: unknown = await response.json();
    if (!isRecord(payload)) throw new Error("Accreditation response invalid");
    return payload;
  });
  pendingRequest = request;
  pendingFetch = currentFetch;
  const clearPending = () => {
    if (pendingRequest === request) {
      pendingRequest = null;
      pendingFetch = null;
    }
  };
  void request.then(clearPending, clearPending);
  return request;
}
