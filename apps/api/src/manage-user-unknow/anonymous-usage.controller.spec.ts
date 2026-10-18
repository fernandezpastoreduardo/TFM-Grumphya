import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Module } from "@nestjs/common";
import type { Response } from "express";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnonymousUsageService } from "./anonymous-usage.service";
import { AnonymousUsageController } from "./anonymous-usage.controller";
import type { PlanUsageService } from "../register-with-plan/plan-usage.service";
import { PlanUsageService as PlanUsageServiceToken } from "../register-with-plan/plan-usage.service";
import { AnonymousUsageService as AnonymousUsageServiceToken } from "./anonymous-usage.service";
import { OptionalAccessTokenGuard } from "../infrastructure/auth/optional-access-token.guard";
import { ACCESS_TOKEN_SESSION_LOOKUP } from "../infrastructure/auth/access-token-session.lookup";
import { issueAccessToken } from "../infrastructure/auth/access-token";
import { ROAST_REPLY_PORT, type RoastReplyPort } from "../roast/roast-reply.port";

const ROAST_MESSAGE = "Grumphya, hoy has venido especialmente inspirada.";
const IDEMPOTENCY_KEY = "d54e74e8-4d23-46d4-9944-0b39bcda0914";
const UPPERCASE_IDEMPOTENCY_KEY = IDEMPOTENCY_KEY.toUpperCase();
const IDEMPOTENCY_HASH = createHash("sha256")
  .update(IDEMPOTENCY_KEY)
  .digest("hex");
const RESERVED = {
  state: "reserved" as const,
  usage: {
    ideas: { limit: 3 as const, used: 0, remaining: 3 },
    roasts: { limit: 3 as const, used: 1, remaining: 2 },
  },
};
const REPLY =
  "He recibido tu mensaje. Mi respuesta definitiva todavía está de vacaciones.";
const AUTHENTICATED_USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const PREVIOUS_ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

async function startAuthenticatedRoastHttpApplication(
  usage: AnonymousUsageService,
  planUsage: PlanUsageService,
): Promise<NestExpressApplication> {
  @Module({
    controllers: [AnonymousUsageController],
    providers: [
      { provide: AnonymousUsageServiceToken, useValue: usage },
      { provide: PlanUsageServiceToken, useValue: planUsage },
      {
        provide: ROAST_REPLY_PORT,
        useValue: { reply: vi.fn().mockResolvedValue(REPLY) },
      },
      OptionalAccessTokenGuard,
      {
        provide: ACCESS_TOKEN_SESSION_LOOKUP,
        useValue: { isActive: async () => true },
      },
    ],
  })
  class AuthenticatedRoastTestingModule {}

  const application = await NestFactory.create<NestExpressApplication>(
    AuthenticatedRoastTestingModule,
    { logger: false },
  );
  application.setGlobalPrefix("api");
  await application.listen(0, "127.0.0.1");
  return application;
}

afterEach(() => {
  if (PREVIOUS_ACCESS_TOKEN_SECRET === undefined)
    delete process.env.ACCESS_TOKEN_SECRET;
  else process.env.ACCESS_TOKEN_SECRET = PREVIOUS_ACCESS_TOKEN_SECRET;
});

function createController(
  planUsageMock?: PlanUsageService,
  roastReply: RoastReplyPort = { reply: vi.fn().mockResolvedValue(REPLY) },
) {
  const usage = {
    initialize: vi
      .fn()
      .mockResolvedValue({ token: "a".repeat(43), usage: RESERVED.usage }),
    reserve: vi.fn().mockResolvedValue(RESERVED),
    commit: vi.fn().mockResolvedValue(RESERVED.usage),
    release: vi.fn().mockResolvedValue(undefined),
  } as unknown as AnonymousUsageService & {
    initialize: ReturnType<typeof vi.fn>;
    reserve: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  return {
    controller: new AnonymousUsageController(usage, planUsageMock, roastReply),
    usage,
  };
}

describe("AnonymousUsageController roast endpoint", () => {
  it("initializes a persistent browser profile from its cookie and records the request IP", async () => {
    const { controller, usage } = createController();
    const request = {
      headers: { cookie: `other=value; grumphya_anon=${"a".repeat(43)}` },
      ip: "192.0.2.25",
      socket: { remoteAddress: "192.0.2.26" },
    } as never;
    const response = { cookie: vi.fn() } as unknown as Response;

    await expect(controller.initialize(request, {}, response)).resolves.toEqual(
      RESERVED.usage,
    );

    expect(usage.initialize).toHaveBeenCalledWith("a".repeat(43), "192.0.2.25");
    expect(response.cookie).toHaveBeenCalledWith(
      "grumphya_anon",
      "a".repeat(43),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/api",
      }),
    );
  });

  it("rejects unexpected profile initialization data before accessing usage", async () => {
    const { controller, usage } = createController();
    const request = { headers: {}, ip: "192.0.2.25" } as never;
    const response = { cookie: vi.fn() } as unknown as Response;

    await expect(
      controller.initialize(request, { used: 3 }, response),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(usage.initialize).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("validates the bounded text and reserves and commits a server-side use", async () => {
    const { controller, usage } = createController();
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).resolves.toEqual({ reply: REPLY });
    expect(usage.reserve).toHaveBeenCalledWith(
      "a".repeat(43),
      "roasts",
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
    expect(usage.commit).toHaveBeenCalledWith(
      "a".repeat(43),
      "roasts",
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      { reply: REPLY },
    );
  });

  it("returns a cached idempotent response without consuming another use", async () => {
    const { controller, usage } = createController();
    usage.reserve.mockResolvedValue({
      state: "cached",
      response: { reply: REPLY },
      usage: RESERVED.usage,
    });
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).resolves.toEqual({ reply: REPLY });
    expect(usage.commit).not.toHaveBeenCalled();
  });

  it("replays a guest roast when the idempotency UUID casing changes", async () => {
    const { controller, usage } = createController();
    usage.reserve.mockResolvedValueOnce(RESERVED).mockResolvedValueOnce({
      state: "cached",
      response: { reply: REPLY },
      usage: RESERVED.usage,
    });
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).resolves.toEqual({ reply: REPLY });
    await expect(
      controller.roast(
        request,
        { message: ROAST_MESSAGE },
        UPPERCASE_IDEMPOTENCY_KEY,
      ),
    ).resolves.toEqual({ reply: REPLY });

    expect(usage.reserve).toHaveBeenNthCalledWith(
      1,
      "a".repeat(43),
      "roasts",
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
    expect(usage.reserve).toHaveBeenNthCalledWith(
      2,
      "a".repeat(43),
      "roasts",
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
    expect(usage.commit).toHaveBeenCalledOnce();
  });

  it("rejects extra fields and oversized messages before reserving a use", async () => {
    const { controller, usage } = createController();
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await expect(
      controller.roast(
        request,
        { message: ROAST_MESSAGE, count: 3 },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.roast(request, { message: "x".repeat(401) }, IDEMPOTENCY_KEY),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usage.reserve).not.toHaveBeenCalled();
  });

  it("releases a reservation when storing the roast response fails", async () => {
    const { controller, usage } = createController();
    usage.commit.mockRejectedValue(new Error("database unavailable"));
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).rejects.toThrow("database unavailable");
    expect(usage.release).toHaveBeenCalledWith(
      "a".repeat(43),
      "roasts",
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
  });

  it("releases a reservation and returns a generic unavailable response when roast generation fails", async () => {
    const roastReply = {
      reply: vi.fn().mockRejectedValue(new Error("OpenAI roast request failed.")),
    };
    const { controller, usage } = createController(undefined, roastReply);
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        code: "ROAST_REPLY_UNAVAILABLE",
        message: "No se ha podido preparar la respuesta ahora.",
      },
    });
    expect(usage.commit).not.toHaveBeenCalled();
    expect(usage.release).toHaveBeenCalledOnce();
  });

  it("uses the Faltón plan quota for an authenticated roast and skips the guest counter", async () => {
    const planUsage = {
      reserveIfPlanActive: vi.fn().mockResolvedValue({ state: "reserved" }),
      commit: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlanUsageService & {
      reserveIfPlanActive: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
    };
    const { controller, usage } = createController(planUsage);
    const request = {
      headers: {},
      user: { userId: "123e4567-e89b-42d3-a456-426614174000" },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).resolves.toEqual({ reply: REPLY });

    expect(planUsage.reserveIfPlanActive).toHaveBeenCalledWith(
      "123e4567-e89b-42d3-a456-426614174000",
      "roasts",
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
    expect(planUsage.commit).toHaveBeenCalledWith(
      "123e4567-e89b-42d3-a456-426614174000",
      "roasts",
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      { reply: REPLY },
    );
    expect(usage.reserve).not.toHaveBeenCalled();
  });

  it("uses the browser free roast quota when an authenticated user has no active Faltón plan", async () => {
    const planUsage = {
      reserveIfPlanActive: vi.fn().mockResolvedValue(null),
      commit: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      recordHistoricalRoastMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlanUsageService & {
      reserveIfPlanActive: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
      recordHistoricalRoastMessage: ReturnType<typeof vi.fn>;
    };
    const { controller, usage } = createController(planUsage);
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
      user: { userId: AUTHENTICATED_USER_ID },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).resolves.toEqual({ reply: REPLY });

    expect(usage.reserve).toHaveBeenCalledWith(
      "a".repeat(43),
      "roasts",
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
    expect(usage.commit).toHaveBeenCalledOnce();
    expect(planUsage.commit).not.toHaveBeenCalled();
    expect(planUsage.recordHistoricalRoastMessage).toHaveBeenCalledWith(
      AUTHENTICATED_USER_ID,
      IDEMPOTENCY_HASH,
    );
  });

  it("does not record anonymous browser roasts in a user ranking", async () => {
    const planUsage = {
      reserveIfPlanActive: vi.fn(),
      recordHistoricalRoastMessage: vi.fn(),
    } as unknown as PlanUsageService & {
      recordHistoricalRoastMessage: ReturnType<typeof vi.fn>;
    };
    const { controller } = createController(planUsage);
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY);

    expect(planUsage.recordHistoricalRoastMessage).not.toHaveBeenCalled();
  });

  it("retries historical ranking persistence for a cached free roast", async () => {
    const planUsage = {
      reserveIfPlanActive: vi.fn().mockResolvedValue(null),
      recordHistoricalRoastMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlanUsageService & {
      reserveIfPlanActive: ReturnType<typeof vi.fn>;
      recordHistoricalRoastMessage: ReturnType<typeof vi.fn>;
    };
    const { controller, usage } = createController(planUsage);
    usage.reserve.mockResolvedValue({
      state: "cached",
      response: { reply: REPLY },
      usage: RESERVED.usage,
    });
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
      user: { userId: AUTHENTICATED_USER_ID },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).resolves.toEqual({ reply: REPLY });

    expect(usage.commit).not.toHaveBeenCalled();
    expect(planUsage.recordHistoricalRoastMessage).toHaveBeenCalledWith(
      AUTHENTICATED_USER_ID,
      IDEMPOTENCY_HASH,
    );
  });

  it("returns the cached authenticated roast response without a second commit", async () => {
    const planUsage = {
      reserveIfPlanActive: vi.fn().mockResolvedValue({
        state: "cached",
        response: { reply: REPLY },
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlanUsageService & {
      reserveIfPlanActive: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
    };
    const { controller, usage } = createController(planUsage);
    const request = {
      headers: {},
      user: { userId: "123e4567-e89b-42d3-a456-426614174000" },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).resolves.toEqual({ reply: REPLY });
    expect(planUsage.commit).not.toHaveBeenCalled();
    expect(usage.reserve).not.toHaveBeenCalled();
  });

  it("routes authenticated HTTP roast requests through Faltón quota", async () => {
    process.env.ACCESS_TOKEN_SECRET =
      "authenticated-roast-http-secret-min-32-bytes";
    const usage = {
      initialize: vi.fn(),
      reserve: vi.fn(),
      commit: vi.fn(),
      release: vi.fn(),
    } as unknown as AnonymousUsageService;
    const planUsage = {
      reserveIfPlanActive: vi.fn().mockResolvedValue({ state: "reserved" }),
      commit: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      recordHistoricalRoastMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlanUsageService & {
      reserveIfPlanActive: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
      recordHistoricalRoastMessage: ReturnType<typeof vi.fn>;
    };
    const application = await startAuthenticatedRoastHttpApplication(
      usage,
      planUsage,
    );

    try {
      const response = await fetch(
        new URL("/api/roast", await application.getUrl()),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": IDEMPOTENCY_KEY,
            Authorization: `Bearer ${issueAccessToken(AUTHENTICATED_USER_ID).token}`,
          },
          body: JSON.stringify({ message: ROAST_MESSAGE }),
        },
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ reply: REPLY });
      expect(planUsage.reserveIfPlanActive).toHaveBeenCalledWith(
        AUTHENTICATED_USER_ID,
        "roasts",
        expect.stringMatching(/^[a-f0-9]{64}$/u),
        expect.stringMatching(/^[a-f0-9]{64}$/u),
      );
      expect(planUsage.commit).toHaveBeenCalledOnce();
      expect(planUsage.recordHistoricalRoastMessage).not.toHaveBeenCalled();
      expect(usage.reserve).not.toHaveBeenCalled();
    } finally {
      await application.close();
    }
  });
});
