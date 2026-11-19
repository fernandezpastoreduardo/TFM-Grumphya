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
    }),
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
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(output, "utf8"));
  assert.equal(manifest.environment, "production");
  assert.equal(manifest.deployment.deploymentSha, sha);
  assert.deepEqual(manifest.deployment.images, {
    api: digest,
    web: digest,
    database: digest,
    proxy: digest,
  });
  assert.equal(manifest.dependencies.packageCount, 2);
  assert.equal(manifest.dependencies.highRiskCount, 0);
  assert.equal(manifest.audit.envelopes.deployment.profile, "beta-d-0.2");
  assert.equal(manifest.audit.envelopes.deployment.scope, "audit:deployment");
  assert.equal(manifest.audit.envelopes.deployment.kid, "ds-auditor-2026");
  assert.equal(
    manifest.audit.envelopes.deployment.attestation.kid,
    "grumphya-release-2026",
  );
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const stableJson = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
      return `{${Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
        .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
  };
  for (const envelope of Object.values(manifest.audit.envelopes)) {
    const unsigned = { ...envelope };
    delete unsigned.attestation;
    envelope.attestation.signature = sign(
      null,
      Buffer.from(stableJson(unsigned)),
      privateKey,
    ).toString("base64url");
  }
  await writeFile(output, stableJson(manifest));
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
