import { All, Controller, Req, UseGuards } from "@nestjs/common";
import type { AuditRequest } from "./audit-technical-auth";
import { auditError } from "./audit-errors";
import { AuditTechnicalAuthGuard } from "./audit-technical-auth";
import { AuditRequestPolicyGuard } from "./audit-request-policy";
import { AUDIT_RESOURCES, type AuditResource } from "./audit.models";
import { AuditService } from "./audit.service";
import { ProcessorInventoryService } from "./processor-inventory.service";

@Controller("audit")
@UseGuards(AuditTechnicalAuthGuard, AuditRequestPolicyGuard)
export class AuditController {
  constructor(
    private readonly service: AuditService,
    private readonly processors: ProcessorInventoryService,
  ) {}

  @All(":resource")
  read(@Req() request: AuditRequest) {
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
    const resource = request.params.resource as string;
    if (!request.auditTechnicalIdentity) {
      throw auditError(401, "invalid_identity", "Falta la identidad técnica.");
    }
    if (resource === "processors") {
      return this.processors.read(request.auditTechnicalIdentity);
    }
    if (!AUDIT_RESOURCES.includes(resource as AuditResource)) {
      throw auditError(
        404,
        "resource_not_allowed",
        "Recurso de auditoría no permitido.",
      );
    }
    return this.service.read(
      resource as AuditResource,
      request.auditTechnicalIdentity,
    );
  }
}
