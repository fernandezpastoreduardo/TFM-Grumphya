import { CanActivate, Injectable, type ExecutionContext } from "@nestjs/common";
import type { Request, Response } from "express";
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { auditError } from "./audit-errors";
import { AUDIT_RESOURCES, type AuditResource } from "./audit.models";

const BEARER_PREFIX = "Bearer ";
const MAX_TOKEN_LIFETIME_SECONDS = 300;
const DEFAULT_CLOCK_SKEW_SECONDS = 30;
const REQUIRED_ISSUER = "desarrolloseguro-audit";
const REQUIRED_AUDIENCE = "grumphya-audit";
const REQUIRED_ENVIRONMENT = "production";
const REQUIRED_DOMAIN = "grumphya.com";
const REQUIRED_HOSTNAME = "grumphya.com";
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u;
const CIDR_PATTERN = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/u;

export type AuditTechnicalIdentity = {
  issuer: string;
  audience: string;
  environment: string;
  domain: string;
  hostname: string;
  scopes: Set<string>;
  issuedAt: number;
  expiresAt: number;
  jti: string;
  kid: string;
};

export type AuditRequest = Request & {
  auditTechnicalIdentity?: AuditTechnicalIdentity;
};

type JwtHeader = { alg?: unknown; typ?: unknown; kid?: unknown };
type JwtClaims = {
  iss?: unknown;
  aud?: unknown;
  environment?: unknown;
  domain?: unknown;
  hostname?: unknown;
  scope?: unknown;
  iat?: unknown;
  exp?: unknown;
  jti?: unknown;
  kid?: unknown;
};

type AuditAuthConfig = {
  enabled: boolean;
  identityActive: boolean;
  issuer: string;
  audience: string;
  environment: string;
  domain: string;
  hostname: string;
  publicKeyPem?: string;
  allowedNetworks: string[];
  allowedKids: string[];
  revokedKids: string[];
  revokedJtis: string[];
  manifestAllowedKids: string[];
  clockSkewSeconds: number;
};

export function readAuditAuthConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AuditAuthConfig {
  const publicKeyPem = readPublicKey(environment);
  return {
    enabled: environment.AUDIT_ENABLED === "true",
    identityActive: environment.AUDIT_TECHNICAL_IDENTITY_ACTIVE !== "false",
    issuer: REQUIRED_ISSUER,
    audience: REQUIRED_AUDIENCE,
    environment: REQUIRED_ENVIRONMENT,
    domain: REQUIRED_DOMAIN,
    hostname: REQUIRED_HOSTNAME,
    publicKeyPem,
    allowedNetworks: (environment.AUDIT_ALLOWED_NETWORKS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    allowedKids: readList(environment.AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS),
    revokedKids: readList(environment.AUDIT_TECHNICAL_AUTH_REVOKED_KIDS),
    revokedJtis: readList(environment.AUDIT_TECHNICAL_AUTH_REVOKED_JTIS),
    manifestAllowedKids: readList(
      environment.AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS,
    ),
    clockSkewSeconds: parseClockSkew(environment.AUDIT_CLOCK_SKEW_SECONDS),
  };
}

function readList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readPublicKey(environment: NodeJS.ProcessEnv): string | undefined {
  const inline = environment.AUDIT_TECHNICAL_AUTH_PUBLIC_KEY?.trim();
  if (inline) return inline.replace(/\\n/gu, "\n");
  const file = environment.AUDIT_TECHNICAL_AUTH_PUBLIC_KEY_FILE?.trim();
  if (!file) return undefined;
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function readManifestPublicKey(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const inline = environment.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY?.trim();
  if (inline) return inline.replace(/\\n/gu, "\n");
  const file = environment.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY_FILE?.trim();
  if (!file) return undefined;
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function isEd25519PublicKey(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return createPublicKey(value).asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}

function isValidNetwork(value: string): boolean {
  const match = CIDR_PATTERN.exec(value);
  return match !== null && ipv4ToNumber(match[1]) !== undefined;
}

export function assertAuditRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const config = readAuditAuthConfig(environment);
  const manifestPublicKey = readManifestPublicKey(environment);
  if (!config.enabled) return;
  if (
    !isEd25519PublicKey(config.publicKeyPem) ||
    config.allowedKids.length === 0 ||
    config.manifestAllowedKids.length === 0 ||
    config.allowedNetworks.length === 0 ||
    config.allowedNetworks.some((network) => !isValidNetwork(network)) ||
    !isEd25519PublicKey(manifestPublicKey)
  ) {
    throw new Error(
      "AUDIT_ENABLED requires both public keys, an allowed kid and an allowed network.",
    );
  }
}

function parseClockSkew(value: string | undefined): number {
  const parsed = Number(value ?? DEFAULT_CLOCK_SKEW_SECONDS);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 60
    ? parsed
    : DEFAULT_CLOCK_SKEW_SECONDS;
}

function decodeJson<T>(encoded: string): T | undefined {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

function parseToken(token: string):
  | {
      signingInput: Buffer;
      header: JwtHeader;
      claims: JwtClaims;
      signature: Buffer;
    }
  | undefined {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0))
    return undefined;
  const header = decodeJson<JwtHeader>(parts[0]);
  const claims = decodeJson<JwtClaims>(parts[1]);
  if (!header || !claims) return undefined;
  return {
    signingInput: Buffer.from(`${parts[0]}.${parts[1]}`, "ascii"),
    header,
    claims,
    signature: Buffer.from(parts[2], "base64url"),
  };
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberClaim(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

function readScopes(value: unknown): Set<string> | undefined {
  if (typeof value !== "string") return undefined;
  const values = value.split(/\s+/u).filter(Boolean);
  const scopes = new Set(values);
  return values.length > 0 && scopes.size === values.length
    ? scopes
    : undefined;
}

function scopesAreAllowlisted(scopes: Set<string>): boolean {
  return [...scopes].every((scope) => {
    const resource = scope.slice("audit:".length);
    return (
      scope.startsWith("audit:") &&
      AUDIT_RESOURCES.includes(resource as AuditResource)
    );
  });
}

function ipv4ToNumber(value: string): number | undefined {
  const match = IPV4_PATTERN.exec(value);
  if (!match) return undefined;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return undefined;
  return (
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  );
}

function isAllowedNetwork(address: string, allowedNetworks: string[]): boolean {
  const ip = ipv4ToNumber(address.replace(/^::ffff:/u, ""));
  if (ip === undefined) return false;
  return allowedNetworks.some((network) => {
    const match = CIDR_PATTERN.exec(network);
    if (!match) return false;
    const networkNumber = ipv4ToNumber(match[1]);
    const prefix = Number(match[2]);
    if (networkNumber === undefined) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ip & mask) === (networkNumber & mask);
  });
}

function requiredScope(resource: AuditResource): string {
  return `audit:${resource}`;
}

export function verifyTechnicalJwt(
  token: string,
  resource: AuditResource,
  config: AuditAuthConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): AuditTechnicalIdentity {
  if (!config.enabled) {
    throw auditError(
      404,
      "resource_not_allowed",
      "Recurso de auditoría no disponible.",
    );
  }
  if (!config.identityActive || !config.publicKeyPem) {
    throw auditError(403, "insufficient_scope", "Identidad técnica no activa.");
  }
  const parsed = parseToken(token);
  if (!parsed || parsed.header.alg !== "EdDSA" || parsed.header.typ !== "JWT") {
    throw auditError(401, "invalid_identity", "Identidad técnica no válida.");
  }
  let publicKey;
  try {
    publicKey = createPublicKey(config.publicKeyPem);
  } catch {
    throw auditError(
      403,
      "insufficient_scope",
      "Identidad técnica no configurada.",
    );
  }
  if (!verify(null, parsed.signingInput, publicKey, parsed.signature)) {
    throw auditError(401, "invalid_identity", "Identidad técnica no válida.");
  }
  const issuer = stringClaim(parsed.claims.iss);
  const audience = stringClaim(parsed.claims.aud);
  const environment = stringClaim(parsed.claims.environment);
  const domain = stringClaim(parsed.claims.domain);
  const hostname = stringClaim(parsed.claims.hostname);
  const scopes = readScopes(parsed.claims.scope);
  const issuedAt = numberClaim(parsed.claims.iat);
  const expiresAt = numberClaim(parsed.claims.exp);
  const jti = stringClaim(parsed.claims.jti);
  const headerKid = stringClaim(parsed.header.kid);
  const claimKid = stringClaim(parsed.claims.kid);
  if (
    !issuer ||
    !audience ||
    !environment ||
    !domain ||
    !hostname ||
    !scopes ||
    issuedAt === undefined ||
    expiresAt === undefined ||
    !jti ||
    !headerKid ||
    !claimKid ||
    headerKid !== claimKid
  ) {
    throw auditError(401, "invalid_identity", "Identidad técnica incompleta.");
  }
  const skew = config.clockSkewSeconds;
  if (
    issuer !== config.issuer ||
    audience !== config.audience ||
    environment !== config.environment ||
    domain !== config.domain ||
    hostname !== config.hostname ||
    !scopesAreAllowlisted(scopes) ||
    !scopes.has(requiredScope(resource)) ||
    config.allowedKids.length === 0 ||
    !config.allowedKids.includes(headerKid) ||
    config.revokedKids.includes(headerKid) ||
    config.revokedJtis.includes(jti) ||
    expiresAt <= nowSeconds - skew ||
    issuedAt > nowSeconds + skew ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_TOKEN_LIFETIME_SECONDS
  ) {
    throw auditError(
      403,
      "insufficient_scope",
      "Identidad técnica no autorizada.",
    );
  }
  return {
    issuer,
    audience,
    environment,
    domain,
    hostname,
    scopes,
    issuedAt,
    expiresAt,
    jti,
    kid: headerKid,
  };
}

function readBearer(request: Request): string {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    throw auditError(401, "invalid_identity", "Falta la identidad técnica.");
  }
  const token = authorization.slice(BEARER_PREFIX.length).trim();
  if (!token || token.includes(" ")) {
    throw auditError(401, "invalid_identity", "Identidad técnica no válida.");
  }
  return token;
}

function requestAddress(request: Request): string {
  return request.ip || request.socket.remoteAddress || "";
}

@Injectable()
export class AuditTechnicalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuditRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const resource = request.params.resource as AuditResource | undefined;
    if (!resource) {
      throw auditError(
        404,
        "resource_not_allowed",
        "Recurso de auditoría no permitido.",
      );
    }
    const config = readAuditAuthConfig();
    if (!config.enabled) {
      throw auditError(
        404,
        "resource_not_allowed",
        "Recurso de auditoría no disponible.",
      );
    }
    if (!isAllowedNetwork(requestAddress(request), config.allowedNetworks)) {
      throw auditError(
        403,
        "insufficient_scope",
        "Red de auditoría no autorizada.",
      );
    }
    if (request.header("cookie")) {
      throw auditError(
        401,
        "invalid_identity",
        "Las cookies no son válidas para la identidad técnica.",
      );
    }
    const identity = verifyTechnicalJwt(readBearer(request), resource, config);
    request.auditTechnicalIdentity = identity;
    response.setHeader("Cache-Control", "no-store");
    return true;
  }
}
