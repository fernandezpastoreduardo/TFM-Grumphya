import { Module } from "@nestjs/common";
import { MailModule } from "../infrastructure/mail/mail.module";
import { MailService } from "../infrastructure/mail/mail.service";
import { PASSWORD_RESET_REPOSITORY } from "./password-reset.repository";
import { PasswordResetController } from "./password-reset.controller";
import { PostgresPasswordResetRepository } from "./postgres-password-reset.repository";
import { PasswordResetService } from "./password-reset.service";

@Module({
  imports: [MailModule],
  controllers: [PasswordResetController],
  providers: [
    {
      provide: PASSWORD_RESET_REPOSITORY,
      useClass: PostgresPasswordResetRepository,
    },
    {
      provide: PasswordResetService,
      useFactory: (
        repository: PostgresPasswordResetRepository,
        mail: MailService,
      ) => new PasswordResetService(repository, mail),
      inject: [PASSWORD_RESET_REPOSITORY, MailService],
    },
  ],
})
export class PasswordResetModule {}
