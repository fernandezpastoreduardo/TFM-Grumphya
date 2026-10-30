import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";

const GENERATOR_PATH = resolve("scripts/generate-internal-tls.sh");
const TEMP_DIRECTORY = mkdtempSync(join(tmpdir(), "grumphya-internal-tls-"));
const PRIVATE_FILES = [
  "internal_tls_ca.key",
  "api_tls.key",
  "web_tls.key",
  "postgres_tls.key",
];
const CERTIFICATE_HOSTNAMES = [
  { name: "api", file: "api_tls.crt" },
  { name: "web", file: "web_tls.crt" },
  { name: "db", file: "postgres_tls.crt" },
];

function run(command, args, { expectedStatus = 0 } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(
    result.status,
    expectedStatus,
    `${command} ${args.join(" ")} failed: ${result.stderr}`,
  );
  return result.stdout.trim();
}

function publicKeyFromCertificate(certificatePath) {
  return run("openssl", ["x509", "-in", certificatePath, "-pubkey", "-noout"]);
}

function publicKeyFromPrivateKey(privateKeyPath) {
  return run("openssl", ["pkey", "-in", privateKeyPath, "-pubout"]);
}

try {
  chmodSync(TEMP_DIRECTORY, 0o700);
  run("bash", [GENERATOR_PATH, TEMP_DIRECTORY]);

  const caCertificatePath = join(TEMP_DIRECTORY, "internal_tls_ca.crt");
  const caCertificate = run("openssl", [
    "x509",
    "-in",
    caCertificatePath,
    "-noout",
    "-text",
  ]);
  assert.match(caCertificate, /CA:TRUE, pathlen:0/);
  assert.match(caCertificate, /Certificate Sign/);
  assert.equal(
    publicKeyFromCertificate(caCertificatePath),
    publicKeyFromPrivateKey(join(TEMP_DIRECTORY, "internal_tls_ca.key")),
  );

  for (const { name, file } of CERTIFICATE_HOSTNAMES) {
    const certificatePath = join(TEMP_DIRECTORY, file);
    const privateKeyPath = join(TEMP_DIRECTORY, file.replace(".crt", ".key"));

    run("openssl", ["verify", "-CAfile", caCertificatePath, certificatePath]);
    const certificate = new X509Certificate(readFileSync(certificatePath));
    assert.equal(certificate.checkHost(name), name);
    if (name !== "db")
      assert.equal(certificate.checkIP("127.0.0.1"), "127.0.0.1");

    const certificateDetails = run("openssl", [
      "x509",
      "-in",
      certificatePath,
      "-noout",
      "-text",
    ]);
    assert.match(certificateDetails, /CA:FALSE/);
    assert.match(certificateDetails, /TLS Web Server Authentication/);
    assert.equal(
      publicKeyFromCertificate(certificatePath),
      publicKeyFromPrivateKey(privateKeyPath),
      `${file} must match its private key`,
    );
  }

  for (const filename of PRIVATE_FILES) {
    assert.equal(
      statSync(join(TEMP_DIRECTORY, filename)).mode & 0o777,
      0o600,
      `${filename} must be private to its owner`,
    );
  }

  const caBeforeSecondGeneration = readFileSync(caCertificatePath);
  const secondRun = spawnSync("bash", [GENERATOR_PATH, TEMP_DIRECTORY], {
    encoding: "utf8",
  });
  assert.notEqual(
    secondRun.status,
    0,
    "existing TLS material must not be replaced",
  );
  assert.match(
    secondRun.stderr,
    /Refusing to overwrite existing internal TLS material/,
  );
  assert.deepEqual(readFileSync(caCertificatePath), caBeforeSecondGeneration);

  console.log("Internal TLS certificate generation checks passed");
} finally {
  rmSync(TEMP_DIRECTORY, { recursive: true, force: true });
}
