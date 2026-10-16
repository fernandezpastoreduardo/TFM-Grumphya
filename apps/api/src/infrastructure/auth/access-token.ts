import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
const JWT_ISSUER = "grumphya-api";
const JWT_AUDIENCE = "grumphya-web";
const JWT_ALGORITHM = "HS256";
const JWT_TYPE = "JWT";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JwtHeader = { alg: string; typ: string };
type JwtPayload = {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
};

export type VerifiedAccessToken = { userId: string };
export type IssuedAccessToken = { token: string; expiresIn: number };

export class AccessTokenConfigurationError extends Error {
  constructor() {
    super("ACCESS_TOKEN_SECRET must be configured with at least 32 bytes.");
    this.name = "AccessTokenConfigurationError";
  }
}

export function issueAccessToken(userId: string): IssuedAccessToken {
  if (!UUID_PATTERN.test(userId)) throw new TypeError("Invalid user identifier.");
  const now = Math.floor(Date.now() / 1000);
  const header: JwtHeader = { alg: JWT_ALGORITHM, typ: JWT_TYPE };
  const payload: JwtPayload = {
    sub: userId,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const unsigned = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signature = createHmac("sha256", getSecret()).update(unsigned).digest("base64url");
  return { token: `${unsigned}.${signature}`, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string): VerifiedAccessToken | null {
  try {
    if (typeof token !== "string" || token.length > 2048) return null;
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    const header = parseJson<JwtHeader>(encodedHeader);
    const payload = parseJson<JwtPayload>(encodedPayload);
    if (
      !isRecord(header) ||
      header.alg !== JWT_ALGORITHM ||
      header.typ !== JWT_TYPE ||
      !isRecord(payload) ||
      typeof payload.sub !== "string" ||
      !UUID_PATTERN.test(payload.sub) ||
      payload.iss !== JWT_ISSUER ||
      payload.aud !== JWT_AUDIENCE ||
      typeof payload.jti !== "string" ||
      !UUID_PATTERN.test(payload.jti) ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000) ||
      payload.exp - payload.iat !== ACCESS_TOKEN_TTL_SECONDS ||
      payload.iat > Math.floor(Date.now() / 1000) + 30
    ) {
      return null;
    }
    const expected = createHmac("sha256", getSecret())
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected))
      return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

function getSecret(): string {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32)
    throw new AccessTokenConfigurationError();
  return secret;
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function parseJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
