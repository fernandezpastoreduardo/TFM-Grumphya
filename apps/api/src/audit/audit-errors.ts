import { HttpException, HttpStatus } from "@nestjs/common";

export type AuditErrorCode =
  | "invalid_request"
  | "invalid_identity"
  | "insufficient_scope"
  | "resource_not_allowed"
  | "method_not_allowed"
  | "response_too_large"
  | "rate_limited"
  | "evidence_unavailable";

export class AuditHttpException extends HttpException {
  readonly code: AuditErrorCode;

  constructor(status: HttpStatus, code: AuditErrorCode, message: string) {
    super({ code, message }, status);
    this.code = code;
  }
}

export function auditError(
  status: HttpStatus,
  code: AuditErrorCode,
  message: string,
): AuditHttpException {
  return new AuditHttpException(status, code, message);
}
