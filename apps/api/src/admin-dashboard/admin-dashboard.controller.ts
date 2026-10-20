import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import { AdminRoleGuard } from "./admin-role.guard";
import {
  AdminContactMessageReply,
  AdminContactReplyError,
} from "./admin-contact-message-reply.service";
import { AdminDashboardService } from "./admin-dashboard.service";

type AuthenticatedAdminRequest = Request & {
  user?: { userId?: unknown };
};

@Controller("admin")
@UseGuards(AccessTokenGuard, AdminRoleGuard)
export class AdminDashboardController {
  constructor(
    @Inject(AdminDashboardService)
    private readonly dashboard: AdminDashboardService,
    @Inject(AdminContactMessageReply)
    private readonly contactReply: AdminContactMessageReply,
  ) {}

  @Get("dashboard")
  getDashboard() {
    return this.dashboard.getSnapshot();
  }

  @Get("contact-messages")
  listContactMessages() {
    return this.dashboard.listContactMessages();
  }

  @Post("contact-messages/:messageId/reply")
  async replyToContactMessage(
    @Req() request: AuthenticatedAdminRequest,
    @Param("messageId") messageId: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.contactReply.execute(
        request.user?.userId,
        messageId,
        body,
      );
    } catch (error) {
      if (error instanceof AdminContactReplyError) {
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
