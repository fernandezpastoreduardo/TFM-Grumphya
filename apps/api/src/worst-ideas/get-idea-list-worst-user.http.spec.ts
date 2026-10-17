import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueAccessToken } from "../infrastructure/auth/access-token";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import {
  ACCESS_TOKEN_SESSION_LOOKUP,
  hashAccessToken,
} from "../infrastructure/auth/access-token-session.lookup";
import { GetIdeaListWorstUserController } from "./get-idea-list-worst-user.controller";
import { GetIdeaListWorstUser } from "./get-idea-list-worst-user.service";

const USER_ID = "d25dc4df-0000-4000-8000-000000000001";
const ITEMS = [{ safeTitle: "Una app para vender hielo en invierno", count: 3 }];
const service = { execute: vi.fn().mockResolvedValue(ITEMS) };
const ACCESS_SECRET = "worst-ideas-user-http-test-secret-at-least-32-bytes";
let activeTokenHash: string | null = null;

class WorstIdeasUserHttpTestModule {}
Module({
  controllers: [GetIdeaListWorstUserController],
  providers: [
    AccessTokenGuard,
    { provide: GetIdeaListWorstUser, useValue: service },
    {
      provide: ACCESS_TOKEN_SESSION_LOOKUP,
      useValue: {
        isActive: (tokenHash: string, userId: string) =>
          tokenHash === activeTokenHash && userId === USER_ID,
      },
    },
  ],
})(WorstIdeasUserHttpTestModule);

describe("getIdeaListWorstUser HTTP endpoint", () => {
  let app: NestExpressApplication;
  let apiOrigin: string;
  let accessToken: string;

  beforeEach(async () => {
    process.env.ACCESS_TOKEN_SECRET = ACCESS_SECRET;
    vi.clearAllMocks();
    service.execute.mockResolvedValue(ITEMS);
    accessToken = issueAccessToken(USER_ID).token;
    activeTokenHash = hashAccessToken(accessToken);
    app = await NestFactory.create<NestExpressApplication>(
      WorstIdeasUserHttpTestModule,
      { logger: ["error"] },
    );
    app.setGlobalPrefix("api");
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

  it("uses the identity from the authenticated session, not a client userId", async () => {
    const response = await fetch(
      `${apiOrigin}/account/worst-ideas?userId=attacker-controlled`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual(ITEMS);
    expect(service.execute).toHaveBeenCalledWith(USER_ID);
    expect(JSON.stringify(body)).not.toContain("score");
  });

  it("requires an access token validated against an active server session", async () => {
    const response = await fetch(`${apiOrigin}/account/worst-ideas`);

    expect(response.status).toBe(401);
    expect(service.execute).not.toHaveBeenCalled();
  });
});
