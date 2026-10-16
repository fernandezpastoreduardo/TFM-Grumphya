import { Module } from "@nestjs/common";
import { RegistrationController } from "./registration.controller";
import { REGISTRATION_REPOSITORY } from "./registration.repository";
import { PostgresRegistrationRepository } from "./postgres-registration.repository";
import { AuthSecurityModule } from "../infrastructure/auth/auth-security.module";
import { PLAN_USAGE_REPOSITORY } from "./plan-usage.models";
import { PostgresPlanUsageRepository } from "./postgres-plan-usage.repository";
import { PlanUsageService } from "./plan-usage.service";

@Module({
  imports: [AuthSecurityModule],
  controllers: [RegistrationController],
  providers: [
    {
      provide: REGISTRATION_REPOSITORY,
      useClass: PostgresRegistrationRepository,
    },
    {
      provide: PLAN_USAGE_REPOSITORY,
      useClass: PostgresPlanUsageRepository,
    },
    PlanUsageService,
  ],
  exports: [REGISTRATION_REPOSITORY, PlanUsageService],
})
export class RegistrationModule {}
