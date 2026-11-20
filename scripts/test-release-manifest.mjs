import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = await mkdtemp(join(tmpdir(), "grumphya-audit-manifest-"));
try {
  const inventory = join(root, "inventory.json");
  const security = join(root, "security.json");
  const composeEvidence = join(root, "compose-evidence.json");
  const browserEvidence = join(root, "browser-evidence.json");
  const auditEvidence = join(root, "audit-evidence.json");
  const output = join(root, "manifest.json");
  const signature = join(root, "manifest.sig");
  const publicKeyPath = join(root, "public-key.pem");
  await writeFile(
    inventory,
    JSON.stringify([
      {
        name: "@grumphya/api",
        version: "0.1.0",
        dependencies: {
          pg: { name: "pg", version: "8.16.3", dependencies: {} },
        },
      },
    ]),
  );
  await writeFile(
    security,
    JSON.stringify({
      trivy: { status: "passed" },
      highRiskCount: 0,
      criticalRiskCount: 0,
      secretCount: 0,
    }),
  );
  await writeFile(
    composeEvidence,
    JSON.stringify({
      tlsTransportVerified: true,
      securityHeadersVerified: true,
      networkSurfaceRestricted: true,
    }),
  );
  await writeFile(
    browserEvidence,
    JSON.stringify({
      responseTimeMs: 210,
      firstContentfulPaintMs: 700,
      interactionToNextPaintMs: 32,
      criticalAccessibilityViolations: 0,
      firstPartyCookiesOnly: true,
      essentialStorageOnly: true,
      thirdPartyOriginCount: 1,
      thirdPartyOriginsAllowlisted: true,
      privacyChoiceSelected: true,
      privacyPolicyVisible: true,
      aiDisclosureVisible: true,
      noticeAcknowledged: true,
    }),
  );
  const evidenceResult = spawnSync(
    process.execPath,
    [
      "scripts/build-release-audit-evidence.mjs",
      security,
      composeEvidence,
      browserEvidence,
      auditEvidence,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CI_QUALITY_RESULT: "success",
        CI_E2E_RESULT: "success",
        CI_DEPENDENCY_RESULT: "success",
      },
    },
  );
  assert.equal(evidenceResult.status, 0, evidenceResult.stderr);
  const failedBrowserEvidence = join(root, "browser-evidence-failed.json");
  const failedAuditEvidence = join(root, "audit-evidence-failed.json");
  await writeFile(
    failedBrowserEvidence,
    JSON.stringify({
      responseTimeMs: 210,
      firstContentfulPaintMs: 700,
      interactionToNextPaintMs: 32,
      criticalAccessibilityViolations: 0,
      firstPartyCookiesOnly: true,
      essentialStorageOnly: true,
      thirdPartyOriginCount: 2,
      thirdPartyOriginsAllowlisted: false,
      privacyChoiceSelected: true,
      privacyPolicyVisible: true,
      aiDisclosureVisible: true,
    }),
  );
  const failedEvidenceResult = spawnSync(
    process.execPath,
    [
      "scripts/build-release-audit-evidence.mjs",
      security,
      composeEvidence,
      failedBrowserEvidence,
      failedAuditEvidence,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CI_QUALITY_RESULT: "success",
        CI_E2E_RESULT: "success",
        CI_DEPENDENCY_RESULT: "success",
      },
    },
  );
  assert.equal(failedEvidenceResult.status, 1);
  const failedSignals = JSON.parse(await readFile(failedAuditEvidence, "utf8"));
  assert.ok(
    Object.values(failedSignals)
      .flat()
      .some((signal) => signal.status === "fail"),
  );
  const sha = "a".repeat(40);
  const digest = "sha256:" + "b".repeat(64);
  const result = spawnSync(
    process.execPath,
    [
      "scripts/create-release-manifest.mjs",
      output,
      inventory,
      security,
      sha,
      digest,
      digest,
      digest,
      digest,
      auditEvidence,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(output, "utf8"));
  assert.equal(manifest.schemaVersion, "beta-d-0.2");
  assert.equal(manifest.deployment.deploymentSha, sha);
  assert.equal(manifest.deploymentDigest.startsWith("sha256:"), true);
  assert.equal(manifest.audit.envelopes.deployment.cardinality, 1);
  for (const envelope of Object.values(manifest.audit.envelopes)) {
    assert.ok(envelope.evidence.signals.length > 0);
    assert.ok(
      envelope.evidence.signals.every((signal) =>
        ["pass", "fail"].includes(signal.status),
      ),
    );
    assert.ok(
      envelope.evidence.signals.every((signal) => signal.status === "pass"),
    );
  }
  assert.deepEqual(Object.keys(manifest.audit.envelopes.deployment).sort(), [
    "attestation",
    "cardinality",
    "deploymentDigest",
    "environment",
    "evidence",
    "observedAt",
    "schemaVersion",
    "validUntil",
  ]);
  const rejectedManifest = spawnSync(
    process.execPath,
    [
      "scripts/create-release-manifest.mjs",
      join(root, "rejected-manifest.json"),
      inventory,
      security,
      sha,
      digest,
      digest,
      digest,
      digest,
      failedAuditEvidence,
    ],
    { encoding: "utf8" },
  );
  assert.equal(rejectedManifest.status, 1);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const canonical = (value) =>
    Array.isArray(value)
      ? "[" + value.map(canonical).join(",") + "]"
      : value !== null && typeof value === "object"
        ? "{" +
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, child]) => JSON.stringify(key) + ":" + canonical(child))
            .join(",") +
          "}"
        : (JSON.stringify(value) ?? "null");
  for (const envelope of Object.values(manifest.audit.envelopes)) {
    const unsigned = { ...envelope };
    delete unsigned.attestation;
    envelope.attestation.signature = sign(
      null,
      Buffer.from(canonical(unsigned)),
      privateKey,
    ).toString("base64url");
  }
  await writeFile(output, canonical(manifest));
  await writeFile(
    signature,
    sign(null, await readFile(output), privateKey).toString("base64url"),
  );
  await writeFile(
    publicKeyPath,
    publicKey.export({ type: "spki", format: "pem" }),
  );
  const verification = spawnSync(
    process.execPath,
    [
      "scripts/verify-release-manifest.mjs",
      output,
      signature,
      publicKeyPath,
      sha,
    ],
    { encoding: "utf8" },
  );
  assert.equal(verification.status, 0, verification.stderr);
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log("Release attestation manifest validated.");
