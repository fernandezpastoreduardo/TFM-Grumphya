import { Module } from "@nestjs/common";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { AuditController } from "./audit.controller";
import { AUDIT_CLOCK, AUDIT_EVIDENCE_REPOSITORY } from "./audit.models";
import { AuditRequestPolicyGuard } from "./audit-request-policy";
import { PostgresAuditEvidenceRepository } from "./postgres-audit-evidence.repository";
import { AuditService } from "./audit.service";
import { AuditTechnicalAuthGuard } from "./audit-technical-auth";
import { ProcessorInventoryService } from "./processor-inventory.service";

@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: ProcessorInventoryService,
      useFactory: (auditService: AuditService, clock: () => Date) =>
        new ProcessorInventoryService(auditService, clock),
      inject: [AuditService, AUDIT_CLOCK],
    },
    AuditTechnicalAuthGuard,
    AuditRequestPolicyGuard,
    { provide: AUDIT_CLOCK, useValue: () => new Date() },
    {
      provide: AUDIT_EVIDENCE_REPOSITORY,
      useFactory: () =>
        new PostgresAuditEvidenceRepository(createPostgresPool()),
    },
  ],
})
export class AuditModule {}
