import { UnauthorizedException } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";
import { LighthouseQualityIngestionGuard } from "./lighthouse-quality-ingestion.guard";

const TOKEN_ENV = "QUALITY_METRICS_INGEST_TOKEN";
const VALID_TOKEN = "test-quality-ingestion-token-with-32-bytes";

function createContext(authorization?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as never;
}

const previousToken = process.env[TOKEN_ENV];
afterEach(() => {
  if (previousToken === undefined) delete process.env[TOKEN_ENV];
  else process.env[TOKEN_ENV] = previousToken;
});

describe("LighthouseQualityIngestionGuard", () => {
  it("accepts the configured bearer secret", () => {
    process.env[TOKEN_ENV] = VALID_TOKEN;
    const guard = new LighthouseQualityIngestionGuard();

    expect(guard.canActivate(createContext(`Bearer ${VALID_TOKEN}`))).toBe(
      true,
    );
  });

  it.each([undefined, "Bearer wrong", "Basic anything"])(
    "rejects missing or invalid authorization",
    (authorization) => {
      process.env[TOKEN_ENV] = VALID_TOKEN;
      const guard = new LighthouseQualityIngestionGuard();

      expect(() => guard.canActivate(createContext(authorization))).toThrow(
        UnauthorizedException,
      );
    },
  );

  it("keeps the ingestion route closed when the server secret is unset or too short", () => {
    process.env[TOKEN_ENV] = "short";
    const guard = new LighthouseQualityIngestionGuard();

    expect(() => guard.canActivate(createContext("Bearer short"))).toThrow(
      UnauthorizedException,
    );
  });
});
