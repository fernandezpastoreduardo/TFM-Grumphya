import {
  Controller,
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { memoryStorage } from "multer";
import { MulterError } from "multer";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import { UserAvatarError } from "./user-avatar.models";
import { UserAvatarService } from "./user-avatar.service";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const avatarUploadFileFilter: NonNullable<
  MulterOptions["fileFilter"]
> = (_request, file, callback) => {
  callback(null, IMAGE_MIME_TYPES.has(file.mimetype));
};
type AuthenticatedRequest = Request & { user?: { userId: string } };

@Catch(MulterError)
class AvatarMulterExceptionFilter implements ExceptionFilter<MulterError> {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({
        statusCode: 413,
        code: "AVATAR_TOO_LARGE",
        message: "La imagen supera el límite de 5 MB.",
      });
      return;
    }
    response.status(400).json({
      statusCode: 400,
      code: "INVALID_AVATAR_UPLOAD",
      message: "No se ha podido leer la imagen. Prueba con un JPG, PNG o WebP.",
    });
  }
}

@Controller()
@UseFilters(AvatarMulterExceptionFilter)
export class UserAvatarController {
  constructor(
    @Inject(UserAvatarService) private readonly avatars: UserAvatarService,
  ) {}

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
      fileFilter: avatarUploadFileFilter,
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
