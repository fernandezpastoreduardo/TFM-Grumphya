import { Module } from "@nestjs/common";
import { RegistrationController } from "./registration.controller";
import { REGISTRATION_REPOSITORY } from "./registration.repository";
import { PostgresRegistrationRepository } from "./postgres-registration.repository";
import { AuthSecurityModule } from "../infrastructure/auth/auth-security.module";
import { PLAN_USAGE_REPOSITORY } from "./plan-usage.models";
import { PostgresPlanUsageRepository } from "./postgres-plan-usage.repository";
import { PlanUsageService } from "./plan-usage.service";
import { RegistrationService } from "./registration.service";
import { MailModule } from "../infrastructure/mail/mail.module";
import { MailService } from "../infrastructure/mail/mail.service";

@Module({
  imports: [AuthSecurityModule, MailModule],
  controllers: [RegistrationController],
  providers: [
    {
      provide: REGISTRATION_REPOSITORY,
      useFactory: () => new PostgresRegistrationRepository(),
    },
    {
      provide: RegistrationService,
      useFactory: (
        repository: PostgresRegistrationRepository,
        mail: MailService,
      ) => new RegistrationService(repository, mail),
      inject: [REGISTRATION_REPOSITORY, MailService],
    },
    {
      provide: PLAN_USAGE_REPOSITORY,
      useFactory: () => new PostgresPlanUsageRepository(),
    },
    PlanUsageService,
  ],
  exports: [REGISTRATION_REPOSITORY, PlanUsageService],
})
export class RegistrationModule {}
