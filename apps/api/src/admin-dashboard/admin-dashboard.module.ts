import { Module } from "@nestjs/common";
import { AuthSecurityModule } from "../infrastructure/auth/auth-security.module";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { ADMIN_DASHBOARD_REPOSITORY } from "./admin-dashboard.models";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminRoleGuard } from "./admin-role.guard";
import { PostgresAdminDashboardRepository } from "./postgres-admin-dashboard.repository";
import { ApplicationErrorFilter } from "./application-error.filter";
import { APP_FILTER, HttpAdapterHost } from "@nestjs/core";
import {
  ADMIN_CONTACT_REPLY_MAILER,
  AdminContactMessageReply,
} from "./admin-contact-message-reply.service";
import { AdminContactReplyMailer } from "./admin-contact-reply-mailer";
import { RegistrationModule } from "../register-with-plan/registration.module";

@Module({
  imports: [AuthSecurityModule, RegistrationModule],
  controllers: [AdminDashboardController],
  providers: [
    {
      provide: ADMIN_DASHBOARD_REPOSITORY,
      useFactory: () =>
        new PostgresAdminDashboardRepository(createPostgresPool()),
    },
    AdminDashboardService,
    AdminContactMessageReply,
    {
      provide: ADMIN_CONTACT_REPLY_MAILER,
      useClass: AdminContactReplyMailer,
    },
    {
      provide: AdminRoleGuard,
      useValue: new AdminRoleGuard(createPostgresPool()),
    },
    {
      provide: APP_FILTER,
      useFactory: (
        host: HttpAdapterHost,
        repository: PostgresAdminDashboardRepository,
      ) => new ApplicationErrorFilter(host, repository),
      inject: [HttpAdapterHost, ADMIN_DASHBOARD_REPOSITORY],
    },
  ],
  exports: [ADMIN_DASHBOARD_REPOSITORY],
})
export class AdminDashboardModule {}
