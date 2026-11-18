import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = await mkdtemp(join(tmpdir(), "grumphya-audit-manifest-"));
try {
  const inventory = join(root, "inventory.json");
  const security = join(root, "security.json");
  const output = join(root, "manifest.json");
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
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log("Release attestation manifest validated.");
