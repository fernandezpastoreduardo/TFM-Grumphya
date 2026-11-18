import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuditTechnicalAuthGuard,
  readAuditAuthConfig,
  verifyTechnicalJwt,
  type AuditTechnicalIdentity,
} from "./audit-technical-auth";

const NOW = 1_800_000_000;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
const ENVIRONMENT_KEYS = [
  "AUDIT_ENABLED",
  "AUDIT_TECHNICAL_IDENTITY_ACTIVE",
  "AUDIT_TECHNICAL_AUTH_ISSUER",
  "AUDIT_TECHNICAL_AUTH_AUDIENCE",
  "AUDIT_TECHNICAL_AUTH_ENVIRONMENT",
  "AUDIT_TECHNICAL_AUTH_DOMAIN",
  "AUDIT_TECHNICAL_AUTH_PUBLIC_KEY",
  "AUDIT_ALLOWED_NETWORKS",
  "AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS",
  "AUDIT_TECHNICAL_AUTH_REVOKED_KIDS",
  "AUDIT_TECHNICAL_AUTH_REVOKED_JTIS",
];

function token(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): string {
  const payload = {
    iss: "ds-reader",
    aud: "grumphya-audit",
    environment: "production",
    domain: "grumphya.com",
    scope: "audit:quality",
    iat: NOW,
    exp: NOW + 240,
    jti: "reader-request-1",
    kid: "ds-reader-2026-11",
    ...claims,
  };
  const encodedHeader = Buffer.from(
    JSON.stringify({
      alg: "EdDSA",
      typ: "JWT",
      kid: "ds-reader-2026-11",
      ...header,
    }),
  ).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(null, Buffer.from(input), privateKey).toString(
    "base64url",
  );
  return `${input}.${signature}`;
}

function configure(overrides: NodeJS.ProcessEnv = {}): void {
  process.env.AUDIT_ENABLED = "true";
  process.env.AUDIT_TECHNICAL_IDENTITY_ACTIVE = "true";
  process.env.AUDIT_TECHNICAL_AUTH_ISSUER = "ds-reader";
  process.env.AUDIT_TECHNICAL_AUTH_AUDIENCE = "grumphya-audit";
  process.env.AUDIT_TECHNICAL_AUTH_ENVIRONMENT = "production";
  process.env.AUDIT_TECHNICAL_AUTH_DOMAIN = "grumphya.com";
  process.env.AUDIT_TECHNICAL_AUTH_PUBLIC_KEY = PUBLIC_KEY;
  process.env.AUDIT_ALLOWED_NETWORKS = "127.0.0.1/32";
  process.env.AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS = "ds-reader-2026-11";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of ENVIRONMENT_KEYS) delete process.env[key];
});

describe("technical audit JWT", () => {
  it("accepts an Ed25519 identity with the required claims", () => {
    configure();
    const identity = verifyTechnicalJwt(
      token(),
      "quality",
      readAuditAuthConfig(),
      NOW,
    );

    expect(identity).toMatchObject<Partial<AuditTechnicalIdentity>>({
      issuer: "ds-reader",
      audience: "grumphya-audit",
      kid: "ds-reader-2026-11",
      jti: "reader-request-1",
    });
  });

  it("rejects missing configuration and an unauthorised network", () => {
    configure({ AUDIT_ENABLED: undefined });
    expect(() =>
      verifyTechnicalJwt(token(), "quality", readAuditAuthConfig(), NOW),
    ).toThrow(/no disponible/i);
    configure({ AUDIT_ALLOWED_NETWORKS: "10.0.0.0/8" });
    expect(readAuditAuthConfig().allowedNetworks).not.toContain("127.0.0.1/32");
  });

  it("closes the HTTP guard before evaluating the ACL when disabled", () => {
    configure({ AUDIT_ENABLED: undefined });
    const guard = new AuditTechnicalAuthGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { resource: "quality" },
          ip: "127.0.0.1",
          socket: { remoteAddress: "127.0.0.1" },
          header: () => "Bearer invalid",
        }),
        getResponse: () => ({ setHeader: () => undefined }),
      }),
    } as never;

    expect(() => guard.canActivate(context)).toThrow(/no disponible/i);
  });

  it.each([
    ["wrong signature", token({ jti: "different" }).slice(0, -3) + "abc"],
    ["wrong scope", token({ scope: "audit:privacy" })],
    ["missing kid", token({}, { kid: undefined })],
    ["expired", token({ exp: NOW - 1 })],
  ])("rejects %s", (_name, signedToken) => {
    configure();
    expect(() =>
      verifyTechnicalJwt(signedToken, "quality", readAuditAuthConfig(), NOW),
    ).toThrow();
  });

  it("revokes an identity by kid or jti", () => {
    configure({ AUDIT_TECHNICAL_AUTH_REVOKED_KIDS: "ds-reader-2026-11" });
    expect(() =>
      verifyTechnicalJwt(token(), "quality", readAuditAuthConfig(), NOW),
    ).toThrow(/no autorizada/i);
    configure({
      AUDIT_TECHNICAL_AUTH_REVOKED_KIDS: "",
      AUDIT_TECHNICAL_AUTH_REVOKED_JTIS: "reader-request-1",
    });
    expect(() =>
      verifyTechnicalJwt(token(), "quality", readAuditAuthConfig(), NOW),
    ).toThrow(/no autorizada/i);
  });

  it("rejects a request from an unauthorised ACL", () => {
    configure({ AUDIT_ALLOWED_NETWORKS: "10.0.0.0/8" });
    const guard = new AuditTechnicalAuthGuard();
    const response = { setHeader: () => undefined };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { resource: "quality" },
          ip: "127.0.0.1",
          socket: { remoteAddress: "127.0.0.1" },
          header: () => `Bearer ${token()}`,
        }),
        getResponse: () => response,
      }),
    } as never;

    expect(() => guard.canActivate(context)).toThrow(/red.*no autorizada/i);
  });
});
