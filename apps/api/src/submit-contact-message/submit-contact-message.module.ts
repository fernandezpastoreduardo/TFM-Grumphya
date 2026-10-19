import { Module } from "@nestjs/common";
import { AuthSecurityModule } from "../infrastructure/auth/auth-security.module";
import { SubmitContactMessageController } from "./submit-contact-message.controller";
import { CONTACT_MESSAGE_REPOSITORY } from "./submit-contact-message.models";
import { PostgresContactMessageRepository } from "./postgres-contact-message.repository";

@Module({
  imports: [AuthSecurityModule],
  controllers: [SubmitContactMessageController],
  providers: [
    {
      provide: CONTACT_MESSAGE_REPOSITORY,
      useClass: PostgresContactMessageRepository,
    },
  ],
})
export class SubmitContactMessageModule {}
