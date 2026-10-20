import {
  Body,
  Controller,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import {
  CONTACT_MESSAGE_REPOSITORY,
  CONTACT_MESSAGE_MAILER,
  ContactMessageError,
  type ContactMessageMailer,
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
    @Inject(CONTACT_MESSAGE_MAILER)
    mailer: ContactMessageMailer,
  ) {
    this.feature = new SubmitContactMessage(repository, mailer);
  }

  @Post()
  async submit(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body() body: unknown,
  ) {
    try {
      const result = await this.feature.execute(
        request.user?.userId,
        idempotencyKey,
        body,
      );
      return {
        status: "saved",
        confirmation: result.status,
        retryAllowed: result.canRetry,
        reference: result.id,
        createdAt: result.createdAt,
      };
    } catch (error) {
      this.rethrowContactMessageError(error);
    }
  }

  @Post(":messageId/confirmation/retry")
  async retryConfirmation(
    @Req() request: AuthenticatedRequest,
    @Param("messageId") messageId: string,
  ) {
    try {
      const result = await this.feature.retryConfirmation(
        request.user?.userId,
        messageId,
      );
      return {
        status: "saved",
        confirmation: result.status,
        retryAllowed: result.canRetry,
        reference: result.id,
        createdAt: result.createdAt,
      };
    } catch (error) {
      this.rethrowContactMessageError(error);
    }
  }

  private rethrowContactMessageError(error: unknown): never {
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
