import { Module } from "@nestjs/common";
import { AuthSecurityModule } from "../infrastructure/auth/auth-security.module";
import { SubmitContactMessageController } from "./submit-contact-message.controller";
import { CONTACT_MESSAGE_REPOSITORY } from "./submit-contact-message.models";
import { PostgresContactMessageRepository } from "./postgres-contact-message.repository";
import { CONTACT_MESSAGE_MAILER } from "./submit-contact-message.models";
import { ContactMessageConfirmationMailer } from "./contact-message-confirmation-mailer";

@Module({
  imports: [AuthSecurityModule],
  controllers: [SubmitContactMessageController],
  providers: [
    {
      provide: CONTACT_MESSAGE_REPOSITORY,
      useClass: PostgresContactMessageRepository,
    },
    {
      provide: CONTACT_MESSAGE_MAILER,
      useClass: ContactMessageConfirmationMailer,
    },
  ],
})
export class SubmitContactMessageModule {}
