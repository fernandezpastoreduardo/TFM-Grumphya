import assert from "node:assert/strict";

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
  "hostname",
  "environment",
  "generatedAt",
  "expiresAt",
  "profile",
  "scope",
  "evidence",
  "attestation",
  "kid",
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
  assert.equal(envelope.hostname, "grumphya.com");
  assert.equal(envelope.environment, "production");
  assert.equal(envelope.profile, "beta-d-0.2");
  assert.equal(envelope.scope, `audit:${route}`);
  assert.equal(typeof envelope.kid, "string");
  assert.equal(envelope.attestation.alg, "EdDSA");
  assert.equal(typeof envelope.attestation.kid, "string");
  assert.equal(typeof envelope.attestation.signature, "string");
  if (Array.isArray(envelope.evidence)) {
    assert.ok(envelope.evidence.length <= 1, `${route}: cardinality`);
  }
}

console.log("Audit contract smoke validated for seven routes.");
