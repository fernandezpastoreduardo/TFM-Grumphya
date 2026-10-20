import { Controller, Get, Inject, NotFoundException } from "@nestjs/common";
import { MailService } from "./mail.service";

@Controller("dev/mail-preview")
export class LocalMailPreviewController {
  constructor(@Inject(MailService) private readonly mailService: MailService) {}

  @Get("latest")
  latest() {
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }
    const preview = this.mailService.getLatestLocalPreview();
    if (!preview) throw new NotFoundException();
    return preview;
  }
}
