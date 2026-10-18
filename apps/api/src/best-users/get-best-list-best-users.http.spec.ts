import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GetBestListBestUsersController } from "./get-best-list-best-users.controller";
import { GetBestListBestUsers } from "./get-best-list-best-users.service";

const PUBLIC_USERS = [
  { username: "laura_critica", approvedIdeasCount: 18 },
  { username: "pablo_sin_pitch", approvedIdeasCount: 13 },
];

class BestUsersHttpTestModule {}
Module({
  controllers: [GetBestListBestUsersController],
  providers: [
    {
      provide: GetBestListBestUsers,
      useValue: { execute: vi.fn().mockResolvedValue(PUBLIC_USERS) },
    },
  ],
})(BestUsersHttpTestModule);

describe("GET /api/best-users", () => {
  let app: NestExpressApplication;
  let endpoint: string;

  beforeEach(async () => {
    app = await NestFactory.create<NestExpressApplication>(
      BestUsersHttpTestModule,
      { logger: false },
    );
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address !== "object" || address === null)
      throw new Error("Test server did not start.");
    endpoint = `http://127.0.0.1:${address.port}/api/best-users`;
  });

  afterEach(async () => {
    await app?.close();
  });

  it("serves only the public aliases and approval counts", async () => {
    const response = await fetch(endpoint);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(PUBLIC_USERS);
  });
});
