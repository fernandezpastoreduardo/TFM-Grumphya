import "reflect-metadata";
import { Controller, Module, Post, UseGuards } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PENDING_REGISTRATION_COOKIE,
  PendingEmailVerificationController,
  PendingEmailVerificationGuard,
  PendingEmailVerificationService,
} from "./pending-email-verification";

const REGISTRATION_ID = "00000000-0000-4000-8000-000000000001";
const PENDING_COOKIE = `${PENDING_REGISTRATION_COOKIE}=${REGISTRATION_ID}`;
let emailVerified = false;
const query = vi.fn(async () => ({ rowCount: emailVerified ? 0 : 1 }));

@Controller("protected-submission")
class ProtectedSubmissionController {
  @Post()
  @UseGuards(PendingEmailVerificationGuard)
  submit() {
    return { submitted: true };
  }
}

@Module({
  controllers: [
    PendingEmailVerificationController,
    ProtectedSubmissionController,
  ],
  providers: [
    PendingEmailVerificationGuard,
    {
      provide: PendingEmailVerificationService,
      useFactory: () =>
        new PendingEmailVerificationService({ query } as unknown as Pool),
    },
  ],
})
class PendingVerificationHttpTestModule {}

describe("pending email verification HTTP flow", () => {
  let app: NestExpressApplication;
  let apiOrigin: string;

  beforeEach(async () => {
    emailVerified = false;
    query.mockClear();
    app = await NestFactory.create<NestExpressApplication>(
      PendingVerificationHttpTestModule,
      { logger: false },
    );
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address !== "object" || address === null) {
      throw new Error("Test server did not start.");
    }
    apiOrigin = `http://127.0.0.1:${address.port}/api`;
  });

  afterEach(async () => {
    await app?.close();
  });

  it("blocks the pending browser until server verification changes its state", async () => {
    const pendingStatus = await fetch(`${apiOrigin}/registration-status`, {
      headers: { Cookie: PENDING_COOKIE },
    });
    expect(pendingStatus.status).toBe(200);
    expect(pendingStatus.headers.get("cache-control")).toBe("no-store");
    expect(await pendingStatus.json()).toEqual({
      emailVerificationPending: true,
    });

    const blocked = await fetch(`${apiOrigin}/protected-submission`, {
      method: "POST",
      headers: { Cookie: PENDING_COOKIE },
    });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({
      code: "EMAIL_VERIFICATION_REQUIRED",
    });

    emailVerified = true;
    const verifiedStatus = await fetch(`${apiOrigin}/registration-status`, {
      headers: { Cookie: PENDING_COOKIE },
    });
    expect(await verifiedStatus.json()).toEqual({
      emailVerificationPending: false,
    });

    const allowed = await fetch(`${apiOrigin}/protected-submission`, {
      method: "POST",
      headers: { Cookie: PENDING_COOKIE },
    });
    expect(allowed.status).toBe(201);
    expect(await allowed.json()).toEqual({ submitted: true });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("user_account.email_verified_at IS NULL"),
      [REGISTRATION_ID],
    );
  });

  it("does not mistake a browser without the registration cookie for a pending account", async () => {
    const status = await fetch(`${apiOrigin}/registration-status`);
    expect(await status.json()).toEqual({ emailVerificationPending: false });
    expect(query).not.toHaveBeenCalled();
  });
});
