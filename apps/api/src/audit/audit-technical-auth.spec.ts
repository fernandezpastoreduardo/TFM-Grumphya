import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import {
  AuditTechnicalAuthGuard,
  assertAuditRuntimeConfiguration,
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
  "AUDIT_TECHNICAL_AUTH_PUBLIC_KEY",
  "AUDIT_RELEASE_MANIFEST_PUBLIC_KEY",
  "AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS",
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
    iss: "desarrolloseguro-audit",
    aud: "grumphya-audit",
    environment: "production",
    domain: "grumphya.com",
    hostname: "grumphya.com",
    scope: "audit:quality",
    iat: NOW,
    exp: NOW + 240,
    jti: "reader-request-1",
    kid: "ds-auditor-2026",
    ...claims,
  };
  const encodedHeader = Buffer.from(
    JSON.stringify({
      alg: "EdDSA",
      typ: "JWT",
      kid: "ds-auditor-2026",
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
  process.env.AUDIT_TECHNICAL_AUTH_PUBLIC_KEY = PUBLIC_KEY;
  process.env.AUDIT_ALLOWED_NETWORKS = "127.0.0.1/32";
  process.env.AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS = "ds-auditor-2026";
  process.env.AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS = "grumphya-release-2026";
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
      issuer: "desarrolloseguro-audit",
      audience: "grumphya-audit",
      kid: "ds-auditor-2026",
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

  it("fails closed when audit is enabled without complete runtime configuration", () => {
    configure({ AUDIT_ALLOWED_NETWORKS: "" });
    expect(() => assertAuditRuntimeConfiguration()).toThrow(/AUDIT_ENABLED/);
  });

  it("fails closed for an invalid network or non-Ed25519 manifest key", () => {
    configure({
      AUDIT_ALLOWED_NETWORKS: "not-a-cidr",
      AUDIT_RELEASE_MANIFEST_PUBLIC_KEY: "not-a-key",
    });
    expect(() => assertAuditRuntimeConfiguration()).toThrow(/AUDIT_ENABLED/);
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
    ["scope outside allowlist", token({ scope: "audit:quality profile:read" })],
    ["duplicate scope", token({ scope: "audit:quality audit:quality" })],
    ["wrong token type", token({}, { typ: "at+jwt" })],
    ["missing kid", token({}, { kid: undefined })],
    ["expired", token({ exp: NOW - 1 })],
  ])("rejects %s", (_name, signedToken) => {
    configure();
    expect(() =>
      verifyTechnicalJwt(signedToken, "quality", readAuditAuthConfig(), NOW),
    ).toThrow();
  });

  it("revokes an identity by kid or jti", () => {
    configure({ AUDIT_TECHNICAL_AUTH_REVOKED_KIDS: "ds-auditor-2026" });
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

  it("authorises the proxy-observed hairpin address instead of the bridge socket address", () => {
    const observedAddress = "198.51.100.23";
    configure({ AUDIT_ALLOWED_NETWORKS: `${observedAddress}/32` });
    const now = Math.floor(Date.now() / 1_000);
    const request = {
      params: { resource: "quality" },
      ip: observedAddress,
      socket: { remoteAddress: "172.20.0.4" },
      header: (name: string) =>
        name === "authorization"
          ? `Bearer ${token({ iat: now, exp: now + 240 })}`
          : undefined,
    };
    const response = { setHeader: vi.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as never;

    expect(new AuditTechnicalAuthGuard().canActivate(context)).toBe(true);
    expect(request).toHaveProperty(
      "auditTechnicalIdentity.kid",
      "ds-auditor-2026",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-store",
    );
  });

  it("rejects cookies even when the bearer identity is valid", () => {
    configure();
    const guard = new AuditTechnicalAuthGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { resource: "quality" },
          ip: "127.0.0.1",
          socket: { remoteAddress: "127.0.0.1" },
          header: (name: string) =>
            name === "authorization"
              ? `Bearer ${token()}`
              : "session=forbidden",
        }),
        getResponse: () => ({ setHeader: () => undefined }),
      }),
    } as never;

    expect(() => guard.canActivate(context)).toThrow(/cookies/i);
  });

  it("logs only safe fields for a rejected egress request", () => {
    configure({ AUDIT_ALLOWED_NETWORKS: "31.70.130.181/32" });
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {
      return undefined;
    });
    const guard = new AuditTechnicalAuthGuard();
    const request = {
      params: { resource: "quality" },
      path: "/audit/quality?token=must-not-log",
      ip: "31.70.130.181",
      socket: { remoteAddress: "31.70.130.181" },
      body: { secret: "must-not-log" },
      header: (name: string) =>
        name === "authorization"
          ? `Bearer ${token().slice(0, -3)}bad`
          : undefined,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader: () => undefined }),
      }),
    } as never;

    expect(() => guard.canActivate(context)).toThrow(/identidad/i);

    expect(warn).toHaveBeenCalledTimes(1);
    const event = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(event).toEqual({
      event: "AUDIT_REQUEST_REJECTED",
      code: "invalid_identity",
      ip: "31.70.130.181",
      route: "/audit/quality",
      kid: "ds-auditor-2026",
    });
    expect(JSON.stringify(event)).not.toContain("must-not-log");
    warn.mockRestore();
  });
});
