import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { verifyAccessToken } from "./access-token";
import {
  ACCESS_TOKEN_SESSION_LOOKUP,
  hashAccessToken,
  type AccessTokenSessionLookup,
} from "./access-token-session.lookup";

type AuthenticatedRequest = Request & {
  user?: { userId: string };
};

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_.-]+)$/i;

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_SESSION_LOOKUP)
    private readonly sessionLookup: AccessTokenSessionLookup,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.get("authorization");
    const match = authorization?.match(BEARER_PATTERN);
    const claims = match ? verifyAccessToken(match[1]!) : null;
    const active =
      claims && match
        ? await this.sessionLookup.isActive(hashAccessToken(match[1]!), claims.userId)
        : false;
    if (!claims || !active) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: "SESSION_REQUIRED",
        message: "Tu sesión ha caducado. Inicia sesión para continuar.",
      });
    }
    request.user = { userId: claims.userId };
    return true;
  }
}
