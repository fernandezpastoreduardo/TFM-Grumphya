import { Body, Controller, Post } from "@nestjs/common";
import { PasswordResetService } from "./password-reset.service";

@Controller("auth/password-reset")
export class PasswordResetController {
  constructor(private readonly service: PasswordResetService) {}

  @Post("request")
  request(@Body() body: unknown) {
    return this.service.request(body);
  }

  @Post("complete")
  complete(@Body() body: unknown) {
    return this.service.complete(body);
  }
}
