import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const BASE_URL = process.env.AUDIT_BASE_URL;
const JWT = process.env.AUDIT_JWT;
const ROUTES = [
  "infrastructure",
  "deployment",
  "dependencies",
  "auth",
  "quality",
  "privacy",
  "ai",
];
const EXPECTED_KEYS = [
  "schemaVersion",
  "observedAt",
  "validUntil",
  "environment",
  "deploymentDigest",
  "cardinality",
  "evidence",
  "attestation",
];

if (!BASE_URL || !JWT) {
  throw new Error("AUDIT_BASE_URL y AUDIT_JWT son obligatorios.");
}

for (const route of ROUTES) {
  const response = await fetch(new URL(`/audit/${route}`, BASE_URL), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${JWT}`,
    },
    redirect: "manual",
  });
  const body = await response.arrayBuffer();
  assert.equal(response.status, 200, `${route}: HTTP ${response.status}`);
  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/json/iu,
    `${route}: content type`,
  );
  assert.equal(response.headers.has("location"), false, `${route}: redirect`);
  assert.ok(body.byteLength < 64 * 1024, `${route}: response too large`);

  const envelope = JSON.parse(new TextDecoder().decode(body));
  assert.deepEqual(Object.keys(envelope).sort(), [...EXPECTED_KEYS].sort());
  assert.equal(envelope.schemaVersion, "beta-d-0.2");
  assert.equal(envelope.environment, "production");
  assert.match(envelope.deploymentDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(envelope.cardinality, 1);
  assert.deepEqual(Object.keys(envelope.evidence).sort(), [
    "observedAt",
    "sampleRef",
    "signals",
  ]);
  assert.match(envelope.evidence.sampleRef, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(envelope.evidence.observedAt, envelope.observedAt);
  assert.equal(
    envelope.evidence.sampleRef,
    "sha256:" +
      createHash("sha256")
        .update(canonical(envelope.evidence.signals), "utf8")
        .digest("hex"),
  );
  assert.equal(envelope.attestation.alg, "EdDSA");
  assert.equal(typeof envelope.attestation.kid, "string");
  assert.equal(typeof envelope.attestation.signature, "string");
}

console.log("Audit contract smoke validated for seven routes.");
