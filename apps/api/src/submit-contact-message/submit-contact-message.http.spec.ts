import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueAccessToken } from "../infrastructure/auth/access-token";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import {
  PendingEmailVerificationGuard,
  PendingEmailVerificationService,
} from "../infrastructure/auth/pending-email-verification";
import {
  ACCESS_TOKEN_SESSION_LOOKUP,
  hashAccessToken,
} from "../infrastructure/auth/access-token-session.lookup";
import { createSecurityMiddleware } from "../security/security.middleware";
import {
  CONTACT_MESSAGE_MAILER,
  CONTACT_MESSAGE_REPOSITORY,
} from "./submit-contact-message.models";
import { SubmitContactMessageController } from "./submit-contact-message.controller";

const WEB_ORIGIN = "http://127.0.0.1:5173";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const REQUEST_KEY = "10000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "20000000-0000-4000-8000-000000000001";
const ACCESS_SECRET = "contact-message-http-test-secret-at-least-32-bytes";
const repository = {
  createForUser: vi.fn(),
  getForUser: vi.fn(),
  claimConfirmation: vi.fn(),
  markConfirmationSent: vi.fn(),
  markConfirmationPreviewed: vi.fn(),
  markConfirmationFailed: vi.fn(),
};
const mailer = { sendConfirmation: vi.fn() };
let activeTokenHash: string | null = null;

class SubmitContactMessageHttpTestModule {}
Module({
  controllers: [SubmitContactMessageController],
  providers: [
    AccessTokenGuard,
    PendingEmailVerificationGuard,
    {
      provide: PendingEmailVerificationService,
      useValue: { isPending: async () => false },
    },
    { provide: CONTACT_MESSAGE_REPOSITORY, useValue: repository },
    { provide: CONTACT_MESSAGE_MAILER, useValue: mailer },
    {
      provide: ACCESS_TOKEN_SESSION_LOOKUP,
      useValue: {
        isActive: (tokenHash: string, userId: string) =>
          tokenHash === activeTokenHash && userId === USER_ID,
      },
    },
  ],
})(SubmitContactMessageHttpTestModule);

describe("submit contact message HTTP flow", () => {
  let app: NestExpressApplication;
  let apiOrigin: string;
  let accessToken: string;

  beforeEach(async () => {
    process.env.WEB_ORIGIN = WEB_ORIGIN;
    process.env.ACCESS_TOKEN_SECRET = ACCESS_SECRET;
    repository.createForUser.mockReset().mockResolvedValue({
      id: MESSAGE_ID,
      createdAt: "2026-10-20T10:00:00.000Z",
      recipient: "persona@example.es",
      subject: "Consulta",
      status: "pending",
      canRetry: true,
    });
    repository.getForUser.mockReset();
    repository.claimConfirmation.mockReset().mockResolvedValue("claimed");
    repository.markConfirmationSent.mockReset().mockResolvedValue(undefined);
    repository.markConfirmationPreviewed
      .mockReset()
      .mockResolvedValue(undefined);
    repository.markConfirmationFailed.mockReset().mockResolvedValue(true);
    mailer.sendConfirmation.mockReset().mockResolvedValue("sent");
    accessToken = issueAccessToken(USER_ID).token;
    activeTokenHash = hashAccessToken(accessToken);
    app = await NestFactory.create<NestExpressApplication>(
      SubmitContactMessageHttpTestModule,
      { logger: false },
    );
    app.setGlobalPrefix("api");
    app.use(createSecurityMiddleware());
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address !== "object" || address === null)
      throw new Error("Test server did not start.");
    apiOrigin = `http://127.0.0.1:${address.port}/api`;
  });

  afterEach(async () => {
    await app?.close();
    delete process.env.ACCESS_TOKEN_SECRET;
  });

  it("requires an active session and stores the message for that session owner", async () => {
    const unauthenticated = await post(
      { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
      { subject: "Consulta", message: "Necesito ayuda con mi cuenta." },
    );
    expect(unauthenticated.status).toBe(401);
    expect(repository.createForUser).not.toHaveBeenCalled();

    const inactiveSessionToken = issueAccessToken(OTHER_USER_ID).token;
    const inactiveSession = await post(
      {
        Origin: WEB_ORIGIN,
        "Content-Type": "application/json",
        Authorization: `Bearer ${inactiveSessionToken}`,
      },
      { subject: "Consulta", message: "Necesito ayuda con mi cuenta." },
    );
    expect(inactiveSession.status).toBe(401);
    expect(repository.createForUser).not.toHaveBeenCalled();

    const invalidPayload = await post(
      {
        Origin: WEB_ORIGIN,
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      { subject: "x", message: "corto" },
    );
    expect(invalidPayload.status).toBe(400);
    expect(repository.createForUser).not.toHaveBeenCalled();

    const authenticated = await post(
      {
        Origin: WEB_ORIGIN,
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      {
        subject: "Consulta",
        message: "Necesito ayuda con mi cuenta.",
        userId: OTHER_USER_ID,
      },
    );

    expect(authenticated.status).toBe(400);
    expect(repository.createForUser).not.toHaveBeenCalled();

    const accepted = await post(
      {
        Origin: WEB_ORIGIN,
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      {
        subject: "  Consulta  ",
        message: "  Necesito ayuda con mi cuenta.  ",
      },
    );

    expect(accepted.status).toBe(201);
    expect(await accepted.json()).toEqual({
      status: "saved",
      confirmation: "sent",
      retryAllowed: false,
      reference: MESSAGE_ID,
      createdAt: "2026-10-20T10:00:00.000Z",
    });
    expect(repository.createForUser).toHaveBeenCalledWith(
      USER_ID,
      REQUEST_KEY,
      "Consulta",
      "Necesito ayuda con mi cuenta.",
    );
  });

  it("rejects a contact message before storing it while email verification is pending", async () => {
    const pending = app.get(PendingEmailVerificationService);
    const pendingSpy = vi.spyOn(pending, "isPending").mockResolvedValue(true);
    try {
      const response = await post(
        {
          Origin: WEB_ORIGIN,
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        { subject: "Consulta", message: "Necesito ayuda con mi cuenta." },
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: "EMAIL_VERIFICATION_REQUIRED",
      });
      expect(repository.createForUser).not.toHaveBeenCalled();
    } finally {
      pendingSpy.mockRestore();
    }
  });

  it("rejects cross-origin submissions before storing a message", async () => {
    const response = await post(
      {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      { subject: "Consulta", message: "Necesito ayuda con mi cuenta." },
    );

    expect(response.status).toBe(403);
    expect(repository.createForUser).not.toHaveBeenCalled();
  });

  async function post(
    headers: Record<string, string>,
    body: object,
  ): Promise<Response> {
    return fetch(`${apiOrigin}/contact-messages`, {
      method: "POST",
      headers: { "Idempotency-Key": REQUEST_KEY, ...headers },
      body: JSON.stringify(body),
    });
  }
});
