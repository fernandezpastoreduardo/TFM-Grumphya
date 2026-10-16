import {
  Controller,
  Delete,
  Inject,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import { privateCookieOptions } from "../infrastructure/http/private-cookie-options";
import {
  USER_DELETE_REPOSITORY,
  UserDeleteError,
  type UserDeleteRepository,
} from "./user-delete.models";
import { UserDeleteService } from "./user-delete.service";

type AuthenticatedRequest = Request & {
  user?: { userId?: unknown };
};

const REFRESH_COOKIE = "grumphya_refresh";
const REFRESH_COOKIE_OPTIONS = privateCookieOptions();

@Controller("account")
@UseGuards(AccessTokenGuard)
export class UserDeleteController {
  private readonly service: UserDeleteService;

  constructor(
    @Inject(USER_DELETE_REPOSITORY) repository: UserDeleteRepository,
  ) {
    this.service = new UserDeleteService(repository);
  }

  @Delete()
  async deleteAccount(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      await this.service.deleteCurrentUser(request.user?.userId);
    } catch (error) {
      if (error instanceof UserDeleteError) {
        throw new UnauthorizedException({
          statusCode: error.status,
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
    response.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
    return { deleted: true };
  }
}
