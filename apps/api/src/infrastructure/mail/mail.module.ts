import { Global, Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { LocalMailPreviewController } from "./mail-preview.controller";

@Global()
@Module({
  controllers: [LocalMailPreviewController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
