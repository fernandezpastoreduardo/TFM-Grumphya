import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GetRoastRankingController } from "./get-roast-ranking.controller";
import { GetRoastRanking } from "./get-roast-ranking.service";

const PUBLIC_RANKING = [
  { username: "GrumpyWinner", roastMessagesSent: 30 },
  { username: "TeaSpiller", roastMessagesSent: 21 },
];

class RoastRankingHttpTestModule {}
Module({
  controllers: [GetRoastRankingController],
  providers: [
    {
      provide: GetRoastRanking,
      useValue: { execute: vi.fn().mockResolvedValue(PUBLIC_RANKING) },
    },
  ],
})(RoastRankingHttpTestModule);

describe("GET /api/roast-ranking", () => {
  let app: NestExpressApplication;
  let endpoint: string;

  beforeEach(async () => {
    app = await NestFactory.create<NestExpressApplication>(
      RoastRankingHttpTestModule,
      { logger: false },
    );
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address !== "object" || address === null)
      throw new Error("Test server did not start.");
    endpoint = `http://127.0.0.1:${address.port}/api/roast-ranking`;
  });

  afterEach(async () => {
    await app?.close();
  });

  it("serves the public ranking with only username and message count", async () => {
    const response = await fetch(endpoint);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(PUBLIC_RANKING);
  });
});
