import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import type { Pool } from "pg";

type AdminRequest = Request & { user?: { userId?: unknown } };

@Injectable()
export class AdminRoleGuard implements CanActivate {
  private readonly pool: Pool;

  constructor(@Optional() @Inject("ADMIN_ROLE_GUARD_POOL") pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const userId = request.user?.userId;
    if (typeof userId !== "string") throw new UnauthorizedException();
    const result = await this.pool.query<{ is_admin: boolean }>(
      `SELECT role='admin' AS is_admin FROM users
       WHERE id=$1 AND status='active'`,
      [userId],
    );
    if (result.rows[0]?.is_admin !== true) {
      throw new ForbiddenException({
        code: "ADMIN_ROLE_REQUIRED",
        message: "No tienes permiso para consultar este panel.",
      });
    }
    return true;
  }
}
