import { CanActivate, Injectable, type ExecutionContext } from "@nestjs/common";
import type { Response } from "express";
import { auditError } from "./audit-errors";
import type { AuditRequest } from "./audit-technical-auth";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 6;
const MAX_RESPONSE_BYTES = 64 * 1024;

type Bucket = { count: number; resetAt: number };

@Injectable()
export class AuditRequestPolicyGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private readonly active = new Set<string>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuditRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const identity = request.auditTechnicalIdentity;
    if (!identity) {
      throw auditError(401, "invalid_identity", "Falta la identidad técnica.");
    }
    if (request.method !== "GET") {
      throw auditError(405, "method_not_allowed", "Solo se permite GET.");
    }
    if (Object.keys(request.query).length > 0) {
      throw auditError(
        400,
        "invalid_request",
        "No se permiten parámetros de consulta.",
      );
    }
    const now = Date.now();
    const bucket = this.buckets.get(identity.jti);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(identity.jti, { count: 1, resetAt: now + WINDOW_MS });
    } else if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
      response.setHeader(
        "Retry-After",
        String(Math.ceil((bucket.resetAt - now) / 1000)),
      );
      throw auditError(429, "rate_limited", "Límite de auditoría excedido.");
    } else {
      bucket.count += 1;
    }
    if (this.active.has(identity.jti)) {
      throw auditError(
        429,
        "rate_limited",
        "Ya existe una petición de auditoría activa.",
      );
    }
    this.active.add(identity.jti);
    response.once("finish", () => this.active.delete(identity.jti));
    response.once("close", () => this.active.delete(identity.jti));
    return true;
  }
}

export function assertAuditResponseSize(payload: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > MAX_RESPONSE_BYTES) {
    throw auditError(
      413,
      "response_too_large",
      "La evidencia supera el tamaño permitido.",
    );
  }
}
