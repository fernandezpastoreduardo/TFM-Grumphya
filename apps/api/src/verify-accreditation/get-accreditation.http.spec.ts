import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GetAccreditationController } from "./get-accreditation.controller";
import { GetAccreditation } from "./get-accreditation.service";

const ACCREDITATION_ID = "DS-GRUMPHYA-2026-001";

class AccreditationHttpTestModule {}
Module({
  controllers: [GetAccreditationController],
  providers: [GetAccreditation],
})(AccreditationHttpTestModule);

describe("GET /api/accreditations/:id", () => {
  let app: NestExpressApplication;
  let endpoint: string;

  beforeEach(async () => {
    app = await NestFactory.create<NestExpressApplication>(
      AccreditationHttpTestModule,
      { logger: false },
    );
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address !== "object" || address === null)
      throw new Error("Test server did not start.");
    endpoint = `http://127.0.0.1:${address.port}/api/accreditations`;
  });

  afterEach(async () => {
    await app?.close();
  });

  it("serves the public demonstration record with no caching or redirect", async () => {
    const response = await fetch(`${endpoint}/${ACCREDITATION_ID}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(body).toMatchObject({
      id: ACCREDITATION_ID,
      issuer: "Desarrollo Seguro",
      application: "Grumphya",
      authorizedDomains: ["grumphya.com"],
      status: "demonstration",
      issuedAt: "2026-10-28T09:38:54.000Z",
      validatedAt: expect.stringMatching(/^2026-10-28T/),
      validationMethod: "Revisión técnica interna de código y pruebas",
      expiresAt: null,
      assurances: expect.arrayContaining([
        expect.objectContaining({ id: "privacy" }),
      ]),
    });
    expect(JSON.stringify(body)).not.toMatch(/secret|token|password/i);
  });

  it("returns 404 for a nonexistent or malformed identifier", async () => {
    for (const id of ["DS-OTHER-2026-001", "not-an-id", "%2e%2e%2fadmin"]) {
      const response = await fetch(`${endpoint}/${id}`);
      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
      expect(JSON.stringify(await response.json())).not.toContain(id);
    }
  });

  it("does not trust Host, Referer, Origin or domain query as the badge site", async () => {
    const response = await fetch(
      `${endpoint}/${ACCREDITATION_ID}?domain=evil.example&redirect=https://evil.example`,
      {
        headers: {
          Referer: "https://evil.example/badge",
          Origin: "https://evil.example",
          Host: "evil.example",
        },
        redirect: "manual",
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authorizedDomains).toEqual(["grumphya.com"]);
    expect(JSON.stringify(body)).not.toContain("evil.example");
    expect(response.headers.get("location")).toBeNull();
  });
});
