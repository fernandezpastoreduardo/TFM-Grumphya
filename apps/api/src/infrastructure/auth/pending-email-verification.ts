import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Header,
  Injectable,
  Inject,
  Req,
  ForbiddenException,
} from "@nestjs/common";
import type { Request } from "express";
import type { Pool } from "pg";
import { createPostgresPool } from "../database/postgres-pool";
import { readCookie } from "../http/read-cookie";

export const PENDING_REGISTRATION_COOKIE = "grumphya_pending_registration";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL_VERIFICATION_REQUIRED = {
  code: "EMAIL_VERIFICATION_REQUIRED",
  message: "Por seguridad tienes que confirmar tu correo.",
};

@Injectable()
export class PendingEmailVerificationService {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }

  async isPending(request: Request): Promise<boolean> {
    const registrationId = readCookie(request, PENDING_REGISTRATION_COOKIE);
    if (!registrationId || !UUID_PATTERN.test(registrationId)) return false;
    const result = await this.pool.query(
      `SELECT 1 FROM pending_registrations registration
       JOIN users user_account ON user_account.id=registration.user_id
       WHERE registration.id=$1
         AND user_account.status='pending_email_verification'
         AND user_account.email_verified_at IS NULL`,
      [registrationId],
    );
    return result.rowCount === 1;
  }
}

@Injectable()
export class PendingEmailVerificationGuard implements CanActivate {
  constructor(
    @Inject(PendingEmailVerificationService)
    private readonly pending: PendingEmailVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (await this.pending.isPending(request)) {
      throw new ForbiddenException(EMAIL_VERIFICATION_REQUIRED);
    }
    return true;
  }
}

@Controller("registration-status")
export class PendingEmailVerificationController {
  constructor(
    @Inject(PendingEmailVerificationService)
    private readonly pending: PendingEmailVerificationService,
  ) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async current(@Req() request: Request) {
    return { emailVerificationPending: await this.pending.isPending(request) };
  }
}
