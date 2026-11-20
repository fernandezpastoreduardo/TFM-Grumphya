import { createHash } from "node:crypto";
import type { AuditResource } from "./audit.models";

export const AUDIT_SIGNAL_STATUSES = [
  "pass",
  "fail",
  "unknown",
  "not_applicable",
] as const;
export type AuditSignalStatus = (typeof AUDIT_SIGNAL_STATUSES)[number];
export const AUDIT_SIGNAL_UNITS = ["boolean", "count", "milliseconds"] as const;
export type AuditSignalUnit = (typeof AUDIT_SIGNAL_UNITS)[number];

export const AUDIT_CRITERIA_BY_RESOURCE: Record<
  AuditResource,
  readonly string[]
> = {
  infrastructure: [
    "infrastructure.tls",
    "infrastructure.headers",
    "infrastructure.network",
  ],
  deployment: ["application.secrets"],
  dependencies: ["application.dependencies"],
  auth: ["authentication.authorization"],
  quality: ["quality.e2e", "quality.accessibility", "performance.page_load"],
  privacy: [
    "privacy.cookies",
    "privacy.third_parties",
    "privacy.consent",
    "ethics.transparency",
  ],
  ai: ["ai.disclosure"],
};

const REASON_CODES: Record<string, readonly string[]> = {
  "infrastructure.tls": [
    "infrastructure_transport_verified",
    "infrastructure_transport_incomplete",
    "infrastructure_transport_not_applicable",
  ],
  "infrastructure.headers": [
    "security_headers_verified",
    "security_headers_missing",
    "security_headers_unobserved",
  ],
  "infrastructure.network": [
    "network_surface_allowlisted",
    "network_surface_restricted",
    "network_surface_unobserved",
  ],
  "application.secrets": ["secrets_not_in_image", "secrets_check_unavailable"],
  "application.dependencies": [
    "dependency_risk_not_observed",
    "high_dependency_risk_observed",
    "critical_dependency_risk_observed",
  ],
  "authentication.authorization": [
    "technical_contract_verified",
    "technical_contract_mismatch",
    "authorization_flow_passed",
    "authorization_flow_failed",
  ],
  "quality.e2e": ["public_flow_loaded", "report_flow_loaded", "release_checks"],
  "quality.accessibility": ["accessibility_critical_violations"],
  "performance.page_load": [
    "response_time",
    "first_contentful_paint",
    "interaction_to_next_paint",
  ],
  "privacy.cookies": [
    "nonessential_storage_before_consent",
    "essential_storage_only_before_consent",
    "raw_identifier_storage_observed",
  ],
  "privacy.third_parties": [
    "third_party_request_count",
    "known_tracker_request_count",
    "external_ingest_enabled",
  ],
  "privacy.consent": ["consent_choice_recorded", "consent_state_respected"],
  "ethics.transparency": [
    "privacy_notice_present",
    "privacy_notice_missing",
    "privacy_notice_unobserved",
  ],
  "ai.disclosure": [
    "ai_disclosure_present",
    "ai_disclosure_missing",
    "ai_disclosure_unobserved",
  ],
};

export type AuditSignal = {
  criterionId: string;
  status: AuditSignalStatus;
  reasonCode: string;
  value: number | null;
  unit: AuditSignalUnit;
  limit?: number;
};

export type AuditEvidence = {
  observedAt: string;
  sampleRef: string;
  signals: AuditSignal[];
};

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_COUNT = 1000;
const MAX_MILLISECONDS = 120_000;

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sampleRefForSignals(signals: readonly AuditSignal[]): string {
  return `sha256:${createHash("sha256").update(canonicalJson(signals), "utf8").digest("hex")}`;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}

function isFiniteInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value)
  );
}

function rangeFor(unit: AuditSignalUnit): number {
  return unit === "count" ? MAX_COUNT : MAX_MILLISECONDS;
}

function qualityLimit(
  criterionId: string,
  reasonCode: string,
): number | undefined {
  if (
    criterionId === "quality.accessibility" &&
    reasonCode === "accessibility_critical_violations"
  )
    return 0;
  if (criterionId === "performance.page_load" && reasonCode === "response_time")
    return 2500;
  if (
    criterionId === "performance.page_load" &&
    reasonCode === "first_contentful_paint"
  )
    return 1800;
  if (
    criterionId === "performance.page_load" &&
    reasonCode === "interaction_to_next_paint"
  )
    return 200;
  return undefined;
}

export function parseAuditEvidence(
  value: unknown,
  resource: AuditResource,
): AuditEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Evidence must be an object.");
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, ["observedAt", "sampleRef", "signals"]))
    throw new Error("Evidence keys are invalid.");
  if (
    typeof record.observedAt !== "string" ||
    !ISO_PATTERN.test(record.observedAt) ||
    !Number.isFinite(Date.parse(record.observedAt))
  )
    throw new Error("Evidence timestamp is invalid.");
  if (
    typeof record.sampleRef !== "string" ||
    !SHA256_PATTERN.test(record.sampleRef)
  )
    throw new Error("Evidence sampleRef is invalid.");
  if (!Array.isArray(record.signals))
    throw new Error("Evidence signals are invalid.");
  const criteria = new Set(AUDIT_CRITERIA_BY_RESOURCE[resource]);
  const seen = new Set<string>();
  const signals = record.signals.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Signal is invalid.");
    const signal = raw as Record<string, unknown>;
    const hasLimit = Object.prototype.hasOwnProperty.call(signal, "limit");
    if (
      !exactKeys(
        signal,
        hasLimit
          ? ["criterionId", "status", "reasonCode", "value", "unit", "limit"]
          : ["criterionId", "status", "reasonCode", "value", "unit"],
      )
    )
      throw new Error("Signal keys are invalid.");
    if (
      typeof signal.criterionId !== "string" ||
      !criteria.has(signal.criterionId)
    )
      throw new Error("Signal criterion is invalid.");
    if (
      !AUDIT_SIGNAL_STATUSES.includes(signal.status as AuditSignalStatus) ||
      typeof signal.reasonCode !== "string" ||
      !REASON_CODES[signal.criterionId]?.includes(signal.reasonCode)
    )
      throw new Error("Signal status or reason is invalid.");
    if (!AUDIT_SIGNAL_UNITS.includes(signal.unit as AuditSignalUnit))
      throw new Error("Signal unit is invalid.");
    const signalKey = signal.criterionId + ":" + signal.reasonCode;
    if (seen.has(signalKey)) throw new Error("Signal is duplicated.");
    seen.add(signalKey);
    const unit = signal.unit as AuditSignalUnit;
    const status = signal.status as AuditSignalStatus;
    if (
      (status === "unknown" || status === "not_applicable") &&
      signal.value !== null
    )
      throw new Error("Unknown signals must use null.");
    if (status !== "unknown" && status !== "not_applicable") {
      if (
        !isFiniteInteger(signal.value) ||
        signal.value < 0 ||
        signal.value > rangeFor(unit) ||
        (unit === "boolean" && signal.value > 1)
      )
        throw new Error("Signal value is out of range.");
    }
    if (unit === "boolean" && hasLimit)
      throw new Error("Boolean signals cannot have a limit.");
    if (
      unit !== "boolean" &&
      (!hasLimit ||
        !isFiniteInteger(signal.limit) ||
        signal.limit < 0 ||
        signal.limit > rangeFor(unit))
    )
      throw new Error("Count and milliseconds signals require a limit.");
    const expectedLimit = qualityLimit(signal.criterionId, signal.reasonCode);
    if (
      expectedLimit !== undefined &&
      (!hasLimit || signal.limit !== expectedLimit)
    )
      throw new Error("Quality signal limit is invalid.");
    return {
      criterionId: signal.criterionId,
      status,
      reasonCode: signal.reasonCode,
      value: signal.value as number | null,
      unit,
      ...(hasLimit ? { limit: signal.limit as number } : {}),
    };
  });
  const typed = {
    observedAt: record.observedAt,
    sampleRef: record.sampleRef as `sha256:${string}`,
    signals,
  };
  if (sampleRefForSignals(signals) !== typed.sampleRef)
    throw new Error("Evidence sampleRef does not match signals.");
  return typed;
}

export function emptyAuditEvidence(observedAt: Date): AuditEvidence {
  const signals: AuditSignal[] = [];
  return {
    observedAt: observedAt.toISOString(),
    sampleRef: sampleRefForSignals(signals) as `sha256:${string}`,
    signals,
  };
}

export function criteriaForResource(
  resource: AuditResource,
): readonly string[] {
  return AUDIT_CRITERIA_BY_RESOURCE[resource];
}
