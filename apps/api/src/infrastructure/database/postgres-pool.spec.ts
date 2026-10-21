import { describe, expect, it } from "vitest";
import { resolvePostgresSslConfig } from "./postgres-pool";

describe("PostgreSQL TLS configuration", () => {
  it("allows TLS to be disabled only for the explicit internal Compose host", () => {
    expect(
      resolvePostgresSslConfig({
        NODE_ENV: "production",
        PGSSL_MODE: "disable-internal",
        PGHOST: "db",
      }),
    ).toBe(false);
    expect(() =>
      resolvePostgresSslConfig({
        NODE_ENV: "production",
        PGSSL_MODE: "disable-internal",
        PGHOST: "database.example.net",
      }),
    ).toThrow("allowed only for the Compose database host 'db'");
  });

  it("requires strict certificate verification for production external databases", () => {
    expect(
      resolvePostgresSslConfig({
        NODE_ENV: "production",
        PGSSL_MODE: "verify-full",
        PGHOST: "database.example.net",
      }),
    ).toEqual({ rejectUnauthorized: true });
    expect(() =>
      resolvePostgresSslConfig({
        NODE_ENV: "production",
        PGSSL_MODE: "insecure",
        PGHOST: "database.example.net",
      }),
    ).toThrow("PGSSL_MODE must be 'verify-full' or 'disable-internal'.");
  });

  it("defaults production connections to strict TLS when no mode is provided", () => {
    expect(
      resolvePostgresSslConfig({
        NODE_ENV: "production",
        PGHOST: "database.example.net",
      }),
    ).toEqual({ rejectUnauthorized: true });
  });

  it("rejects the internal TLS exception when the Compose host is missing", () => {
    expect(() =>
      resolvePostgresSslConfig({
        NODE_ENV: "production",
        PGSSL_MODE: "disable-internal",
      }),
    ).toThrow("allowed only for the Compose database host 'db'");
  });

  it("leaves local development on the driver's default TLS behavior", () => {
    expect(
      resolvePostgresSslConfig({ NODE_ENV: "development" }),
    ).toBeUndefined();
  });
});
