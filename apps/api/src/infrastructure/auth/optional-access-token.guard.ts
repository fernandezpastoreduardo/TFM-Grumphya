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

type OptionalAuthenticatedRequest = Request & {
  user?: { userId: string };
};

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_.-]+)$/i;

@Injectable()
export class OptionalAccessTokenGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_SESSION_LOOKUP)
    private readonly sessionLookup: AccessTokenSessionLookup,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<OptionalAuthenticatedRequest>();
    const authorization = request.get("authorization");
    if (!authorization) return true;

    const match = authorization.match(BEARER_PATTERN);
    const token = match?.[1];
    const claims = token ? verifyAccessToken(token) : null;
    if (!claims || !token) throw sessionRequired();
    const active = await this.sessionLookup.isActive(
      hashAccessToken(token),
      claims.userId,
    );
    if (!active) throw sessionRequired();
    request.user = { userId: claims.userId };
    return true;
  }
}

function sessionRequired(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    code: "SESSION_REQUIRED",
    message: "Tu sesión ha caducado. Inicia sesión para continuar.",
  });
}
