import {
  Body,
  Controller,
  HttpException,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import {
  CONTACT_MESSAGE_REPOSITORY,
  ContactMessageError,
  type ContactMessageRepository,
} from "./submit-contact-message.models";
import { SubmitContactMessage } from "./submit-contact-message.service";

type AuthenticatedRequest = Request & { user?: { userId?: unknown } };

@Controller("contact-messages")
@UseGuards(AccessTokenGuard)
export class SubmitContactMessageController {
  private readonly feature: SubmitContactMessage;

  constructor(
    @Inject(CONTACT_MESSAGE_REPOSITORY)
    repository: ContactMessageRepository,
  ) {
    this.feature = new SubmitContactMessage(repository);
  }

  @Post()
  async submit(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    try {
      await this.feature.execute(request.user?.userId, body);
      return { status: "received" };
    } catch (error) {
      if (error instanceof ContactMessageError) {
        throw new HttpException(
          {
            statusCode: error.status,
            code: error.code,
            message: error.message,
          },
          error.status,
        );
      }
      throw error;
    }
  }
}
