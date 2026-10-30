import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePostgresSslConfig } from "./postgres-pool";

const TEST_CA_CERTIFICATE = "test internal CA certificate";

describe("PostgreSQL TLS configuration", () => {
  it("requires and loads the trusted CA for strictly verified production TLS", () => {
    const directory = mkdtempSync(join(tmpdir(), "grumphya-postgres-tls-"));
    const caFile = join(directory, "ca.crt");
    writeFileSync(caFile, TEST_CA_CERTIFICATE);
    try {
      expect(
        resolvePostgresSslConfig({
          NODE_ENV: "production",
          PGSSL_MODE: "verify-full",
          PGSSL_CA_FILE: caFile,
          PGHOST: "db",
        }),
      ).toEqual({
        rejectUnauthorized: true,
        ca: readFileSync(caFile),
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects the former plaintext internal database mode", () => {
    expect(() =>
      resolvePostgresSslConfig({
        NODE_ENV: "production",
        PGSSL_MODE: "disable-internal",
        PGHOST: "db",
      }),
    ).toThrow("PGSSL_MODE must be 'verify-full' in production.");
  });

  it("requires an explicit CA certificate in production", () => {
    expect(() =>
      resolvePostgresSslConfig({
        NODE_ENV: "production",
      }),
    ).toThrow("PGSSL_CA_FILE must be configured in production.");
  });

  it("rejects unreadable CA certificate paths without leaking file details", () => {
    expect(() =>
      resolvePostgresSslConfig({
        NODE_ENV: "production",
        PGSSL_CA_FILE: "/missing/internal-ca.crt",
      }),
    ).toThrow("PGSSL_CA_FILE must point to a readable CA certificate.");
  });

  it("leaves local development on the driver's default TLS behavior", () => {
    expect(
      resolvePostgresSslConfig({ NODE_ENV: "development" }),
    ).toBeUndefined();
  });
});
