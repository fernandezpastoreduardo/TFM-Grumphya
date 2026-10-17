import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GetIdeaListWorstAllController } from "./get-idea-list-worst-all.controller";
import { GetIdeaListWorstAll } from "./get-idea-list-worst-all.service";

const RANKING = [{ safeTitle: "Una suscripción a los lunes", weeklyCount: 4 }];

class WorstIdeasHttpTestModule {}
Module({
  controllers: [GetIdeaListWorstAllController],
  providers: [
    {
      provide: GetIdeaListWorstAll,
      useValue: { execute: vi.fn().mockResolvedValue(RANKING) },
    },
  ],
})(WorstIdeasHttpTestModule);

describe("getIdeaListWorstAll HTTP endpoint", () => {
  let app: NestExpressApplication;
  let apiOrigin: string;

  beforeEach(async () => {
    app = await NestFactory.create<NestExpressApplication>(
      WorstIdeasHttpTestModule,
      { logger: false },
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
  });

  it("serves the public ranking without exposing internal or personal fields", async () => {
    const response = await fetch(`${apiOrigin}/worst-ideas`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(RANKING);
  });
});
