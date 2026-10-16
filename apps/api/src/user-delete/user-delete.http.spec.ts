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
import { createSecurityMiddleware } from "../security/security.middleware";
import { USER_DELETE_REPOSITORY } from "./user-delete.models";
import { UserDeleteController } from "./user-delete.controller";

const WEB_ORIGIN = "http://127.0.0.1:5173";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const ACCESS_SECRET = "user-delete-http-test-secret-with-at-least-32-bytes";

const repository = { deleteUser: vi.fn() };
let activeTokenHash: string | null = null;

class UserDeleteHttpTestModule {}
Module({
  controllers: [UserDeleteController],
  providers: [
    AccessTokenGuard,
    { provide: USER_DELETE_REPOSITORY, useValue: repository },
    {
      provide: ACCESS_TOKEN_SESSION_LOOKUP,
      useValue: {
        isActive: (tokenHash: string, userId: string) =>
          tokenHash === activeTokenHash && userId === USER_ID,
      },
    },
  ],
})(UserDeleteHttpTestModule);

describe("user deletion HTTP flow", () => {
  let app: NestExpressApplication;
  let apiOrigin: string;
  let accessToken: string;

  beforeEach(async () => {
    process.env.WEB_ORIGIN = WEB_ORIGIN;
    process.env.ACCESS_TOKEN_SECRET = ACCESS_SECRET;
    repository.deleteUser.mockReset().mockResolvedValue(true);
    accessToken = issueAccessToken(USER_ID).token;
    activeTokenHash = hashAccessToken(accessToken);
    app = await NestFactory.create<NestExpressApplication>(
      UserDeleteHttpTestModule,
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

  it("requires a valid active bearer session and deletes only its owner", async () => {
    const unauthenticated = await requestDelete({
      Origin: WEB_ORIGIN,
      "Content-Type": "application/json",
    });
    expect(unauthenticated.status).toBe(401);
    expect(repository.deleteUser).not.toHaveBeenCalled();

    const authenticated = await requestDelete({
      Origin: WEB_ORIGIN,
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    }, { userId: OTHER_USER_ID });

    expect(authenticated.status).toBe(200);
    expect(await authenticated.json()).toEqual({ deleted: true });
    expect(repository.deleteUser).toHaveBeenCalledOnce();
    expect(repository.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(authenticated.headers.get("set-cookie")).toContain(
      "grumphya_refresh=;",
    );
    expect(authenticated.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rejects cross-origin deletion before touching the repository", async () => {
    const response = await requestDelete({
      Origin: "https://attacker.example",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    });

    expect(response.status).toBe(403);
    expect(repository.deleteUser).not.toHaveBeenCalled();
  });

  async function requestDelete(
    headers: Record<string, string>,
    body: object = {},
  ): Promise<Response> {
    return fetch(`${apiOrigin}/account`, {
      method: "DELETE",
      headers,
      body: JSON.stringify(body),
    });
  }
});
