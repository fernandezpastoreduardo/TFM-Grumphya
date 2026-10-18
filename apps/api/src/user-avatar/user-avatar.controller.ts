import {
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { memoryStorage } from "multer";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import { UserAvatarError } from "./user-avatar.models";
import { UserAvatarService } from "./user-avatar.service";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
type AuthenticatedRequest = Request & { user?: { userId: string } };

@Controller()
export class UserAvatarController {
  constructor(private readonly avatars: UserAvatarService) {}

  @Post("account/avatar")
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(
    FileInterceptor("avatar", {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_AVATAR_BYTES,
        files: 1,
        fields: 0,
        parts: 1,
        fieldNameSize: 100,
        headerPairs: 100,
      },
      fileFilter: (_request, file, callback) => {
        callback(null, IMAGE_MIME_TYPES.has(file.mimetype));
      },
    }),
  )
  async uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: unknown,
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: "SESSION_REQUIRED",
        message: "Inicia sesión para actualizar tu avatar.",
      });
    }
    try {
      return await this.avatars.update(userId, file);
    } catch (error) {
      if (error instanceof UserAvatarError) {
        throw new UserAvatarHttpException(
          error.status,
          error.code,
          error.message,
        );
      }
      throw error;
    }
  }

  @Get("avatars/:avatarKey")
  async getAvatar(
    @Param("avatarKey") avatarKey: string,
    @Res() response: Response,
  ) {
    const image = await this.avatars.read(avatarKey);
    if (!image) {
      response.status(404).end();
      return;
    }
    response.setHeader("Content-Type", "image/webp");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(image);
  }
}

class UserAvatarHttpException extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ statusCode: status, code, message }, status);
  }
}
