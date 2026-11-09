import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  PENDING_REGISTRATION_COOKIE,
  PendingEmailVerificationGuard,
  PendingEmailVerificationService,
} from "./pending-email-verification";

const REGISTRATION_ID = "00000000-0000-4000-8000-000000000001";

function request(cookie?: string): Request {
  return { headers: cookie ? { cookie } : {} } as Request;
}

function context(httpRequest: Request): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => httpRequest }),
  } as ExecutionContext;
}

describe("pending email verification", () => {
  it("rejects submissions while the browser registration is pending", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pending = new PendingEmailVerificationService({
      query,
    } as unknown as Pool);
    const guard = new PendingEmailVerificationGuard(pending);

    await expect(
      guard.canActivate(
        context(request(`${PENDING_REGISTRATION_COOKIE}=${REGISTRATION_ID}`)),
      ),
    ).rejects.toMatchObject({
      response: {
        code: "EMAIL_VERIFICATION_REQUIRED",
      },
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("user_account.email_verified_at IS NULL"),
      [REGISTRATION_ID],
    );
  });

  it("allows a verified registration and anonymous visitors without a pending cookie", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const pending = new PendingEmailVerificationService({
      query,
    } as unknown as Pool);
    const guard = new PendingEmailVerificationGuard(pending);

    await expect(
      guard.canActivate(
        context(request(`${PENDING_REGISTRATION_COOKIE}=${REGISTRATION_ID}`)),
      ),
    ).resolves.toBe(true);
    await expect(guard.canActivate(context(request()))).resolves.toBe(true);
    expect(query).toHaveBeenCalledOnce();
  });

  it("does not query the database for an invalid registration cookie", async () => {
    const query = vi.fn();
    const pending = new PendingEmailVerificationService({
      query,
    } as unknown as Pool);

    await expect(
      pending.isPending(request(`${PENDING_REGISTRATION_COOKIE}=invalid`)),
    ).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
