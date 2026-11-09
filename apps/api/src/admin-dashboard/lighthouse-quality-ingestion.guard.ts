import { CanActivate, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";

const INGEST_TOKEN_ENV = "QUALITY_METRICS_INGEST_TOKEN";
const BEARER_PREFIX = "Bearer ";
const SAFE_INGEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/u;

@Injectable()
export class LighthouseQualityIngestionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env[INGEST_TOKEN_ENV] ?? "";
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const candidate =
      typeof authorization === "string" &&
      authorization.startsWith(BEARER_PREFIX)
        ? authorization.slice(BEARER_PREFIX.length)
        : "";
    const expectedBuffer = Buffer.from(secret, "utf8");
    const candidateBuffer = Buffer.from(candidate, "utf8");
    const authorized =
      SAFE_INGEST_TOKEN_PATTERN.test(secret) &&
      expectedBuffer.byteLength === candidateBuffer.byteLength &&
      timingSafeEqual(expectedBuffer, candidateBuffer);
    if (!authorized) throw new UnauthorizedException();
    return true;
  }
}
