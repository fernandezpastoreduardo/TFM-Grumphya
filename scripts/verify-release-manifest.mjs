import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";

const [, , manifestPath, signaturePath, publicKeyPath, expectedSha] =
  process.argv;
const RESOURCES = [
  "infrastructure",
  "deployment",
  "dependencies",
  "auth",
  "quality",
  "privacy",
  "ai",
];
const RELEASE_KID = "grumphya-release-2026";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const STATUSES = new Set(["pass", "fail", "unknown", "not_applicable"]);
const UNITS = new Set(["boolean", "count", "milliseconds"]);
const REASONS = {
  "infrastructure.tls": new Set([
    "infrastructure_transport_verified",
    "infrastructure_transport_incomplete",
    "infrastructure_transport_not_applicable",
  ]),
  "infrastructure.headers": new Set([
    "security_headers_verified",
    "security_headers_missing",
    "security_headers_unobserved",
  ]),
  "infrastructure.network": new Set([
    "network_surface_allowlisted",
    "network_surface_restricted",
    "network_surface_unobserved",
  ]),
  "application.secrets": new Set([
    "secrets_not_in_image",
    "secrets_present_in_image",
    "secrets_check_unavailable",
  ]),
  "application.dependencies": new Set([
    "dependency_risk_not_observed",
    "high_dependency_risk_observed",
    "critical_dependency_risk_observed",
  ]),
  "authentication.authorization": new Set([
    "technical_contract_verified",
    "technical_contract_mismatch",
    "authorization_flow_passed",
    "authorization_flow_failed",
  ]),
  "quality.e2e": new Set([
    "public_flow_loaded",
    "report_flow_loaded",
    "release_checks",
  ]),
  "quality.accessibility": new Set(["accessibility_critical_violations"]),
  "performance.page_load": new Set([
    "response_time",
    "first_contentful_paint",
    "interaction_to_next_paint",
  ]),
  "privacy.cookies": new Set([
    "nonessential_storage_before_consent",
    "essential_storage_only_before_consent",
    "raw_identifier_storage_observed",
  ]),
  "privacy.third_parties": new Set([
    "third_party_request_count",
    "third_party_origin_count",
    "third_party_origins_allowlisted",
    "third_party_origin_not_allowlisted",
    "known_tracker_request_count",
    "external_ingest_enabled",
  ]),
  "privacy.consent": new Set([
    "consent_choice_recorded",
    "consent_choice_not_recorded",
    "consent_choice_selected",
    "consent_choice_not_selected",
    "consent_state_respected",
  ]),
  "ethics.transparency": new Set([
    "privacy_notice_present",
    "privacy_notice_missing",
    "privacy_notice_unobserved",
  ]),
  "ai.disclosure": new Set([
    "ai_disclosure_present",
    "ai_disclosure_missing",
    "ai_disclosure_unobserved",
  ]),
};
const ROUTE_CRITERIA = {
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
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => JSON.stringify(key) + ":" + canonical(child))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
function validSignal(signal, criteria) {
  if (!signal || typeof signal !== "object" || Array.isArray(signal))
    return false;
  const keys = Object.keys(signal);
  const hasLimit = Object.hasOwn(signal, "limit");
  const expected = hasLimit
    ? ["criterionId", "status", "reasonCode", "value", "unit", "limit"]
    : ["criterionId", "status", "reasonCode", "value", "unit"];
  if (
    keys.length !== expected.length ||
    !expected.every((key) => keys.includes(key)) ||
    !criteria.includes(signal.criterionId) ||
    !STATUSES.has(signal.status) ||
    !REASONS[signal.criterionId]?.has(signal.reasonCode) ||
    !UNITS.has(signal.unit)
  )
    return false;
  if (
    (signal.status === "unknown" || signal.status === "not_applicable") &&
    signal.value !== null
  )
    return false;
  const max =
    signal.unit === "count"
      ? 1000
      : signal.unit === "milliseconds"
        ? 120000
        : 1;
  if (
    signal.status !== "unknown" &&
    signal.status !== "not_applicable" &&
    (!Number.isInteger(signal.value) || signal.value < 0 || signal.value > max)
  )
    return false;
  if (signal.unit === "boolean" && hasLimit) return false;
  if (
    signal.unit !== "boolean" &&
    (!hasLimit ||
      !Number.isInteger(signal.limit) ||
      signal.limit < 0 ||
      signal.limit > max)
  )
    return false;
  const quality = {
    "quality.accessibility:accessibility_critical_violations": 0,
    "performance.page_load:response_time": 2500,
    "performance.page_load:first_contentful_paint": 1800,
    "performance.page_load:interaction_to_next_paint": 200,
  };
  return (
    quality[signal.criterionId + ":" + signal.reasonCode] === undefined ||
    signal.limit === quality[signal.criterionId + ":" + signal.reasonCode]
  );
}
function validEvidence(evidence, resource) {
  if (
    !evidence ||
    typeof evidence !== "object" ||
    Array.isArray(evidence) ||
    Object.keys(evidence).sort().join(",") !== "observedAt,sampleRef,signals" ||
    !Number.isFinite(Date.parse(evidence.observedAt)) ||
    !/^sha256:[0-9a-f]{64}$/u.test(evidence.sampleRef) ||
    !Array.isArray(evidence.signals)
  )
    return false;
  const criteria = ROUTE_CRITERIA[resource];
  const seen = new Set();
  if (
    !evidence.signals.every((signal) => {
      const key = signal?.criterionId + ":" + signal?.reasonCode;
      if (seen.has(key)) return false;
      seen.add(key);
      return validSignal(signal, criteria);
    })
  )
    return false;
  return (
    evidence.sampleRef ===
    "sha256:" +
      createHash("sha256")
        .update(canonical(evidence.signals), "utf8")
        .digest("hex")
  );
}
try {
  if (
    !manifestPath ||
    !signaturePath ||
    !publicKeyPath ||
    !/^[0-9a-f]{40}$/u.test(expectedSha ?? "")
  )
    process.exit(2);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const signature = Buffer.from(
    (await readFile(signaturePath, "utf8")).trim(),
    "base64url",
  );
  const publicKey = createPublicKey(await readFile(publicKeyPath, "utf8"));
  const deployment = manifest.deployment;
  const images = deployment?.images;
  const baseValid =
    verify(
      null,
      Buffer.from(canonical(manifest), "utf8"),
      publicKey,
      signature,
    ) &&
    manifest.schemaVersion === "beta-d-0.2" &&
    manifest.environment === "production" &&
    deployment?.deploymentSha === expectedSha &&
    DIGEST.test(manifest.deploymentDigest ?? "") &&
    images &&
    Object.keys(images).length === 4 &&
    Object.values(images).every((value) => DIGEST.test(value)) &&
    /^[0-9a-f]{64}$/u.test(
      manifest.dependencies?.dependencyInventoryDigest ?? "",
    ) &&
    Number.isFinite(Date.parse(manifest.observedAt)) &&
    Number.isFinite(Date.parse(manifest.validUntil)) &&
    Date.parse(manifest.validUntil) > Date.parse(manifest.observedAt) &&
    Date.parse(manifest.validUntil) - Date.parse(manifest.observedAt) <=
      24 * 60 * 60 * 1000;
  const envelopesValid = RESOURCES.every((resource) => {
    const envelope = manifest.audit?.envelopes?.[resource];
    if (
      !envelope ||
      Object.keys(envelope).sort().join(",") !==
        "attestation,cardinality,deploymentDigest,environment,evidence,observedAt,schemaVersion,validUntil" ||
      envelope.schemaVersion !== "beta-d-0.2" ||
      envelope.environment !== "production" ||
      envelope.cardinality !== 1 ||
      envelope.deploymentDigest !== manifest.deploymentDigest ||
      !Number.isFinite(Date.parse(envelope.observedAt)) ||
      !Number.isFinite(Date.parse(envelope.validUntil)) ||
      Date.parse(envelope.validUntil) <= Date.parse(envelope.observedAt) ||
      !validEvidence(envelope.evidence, resource) ||
      Date.parse(envelope.validUntil) - Date.parse(envelope.observedAt) >
        24 * 60 * 60 * 1000 ||
      envelope.attestation?.alg !== "EdDSA" ||
      envelope.attestation?.kid !== RELEASE_KID ||
      typeof envelope.attestation?.signature !== "string"
    )
      return false;
    const { attestation, ...unsigned } = envelope;
    return verify(
      null,
      Buffer.from(canonical(unsigned), "utf8"),
      publicKey,
      Buffer.from(attestation.signature, "base64url"),
    );
  });
  process.exit(baseValid && envelopesValid ? 0 : 1);
} catch {
  process.exit(1);
}
