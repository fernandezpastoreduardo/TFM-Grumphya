import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSecurityMiddleware } from "../security/security.middleware";
import { RegistrationController } from "./registration.controller";
import { InMemoryRegistrationRepository } from "./registration-testing.repository";
import { REGISTRATION_REPOSITORY } from "./registration.repository";
import { DevelopmentVerificationDelivery } from "./verification-delivery";

const WEB_ORIGIN = "http://127.0.0.1:5173";
const REGISTRATION_BODY = {
  email: "Persona@example.es",
  username: "PersonaLista",
  password: "Una contraseña suficientemente segura 48!",
  privacyPolicyAcknowledged: true,
};

class RegistrationHttpTestModule {}
Module({
  controllers: [RegistrationController],
  providers: [
    { provide: REGISTRATION_REPOSITORY, useValue: new InMemoryRegistrationRepository() },
    DevelopmentVerificationDelivery,
  ],
})(RegistrationHttpTestModule);

describe("registration HTTP flow", () => {
  let app: NestExpressApplication;
  let apiOrigin: string;

  beforeEach(async () => {
    process.env.WEB_ORIGIN = WEB_ORIGIN;
    app = await NestFactory.create<NestExpressApplication>(RegistrationHttpTestModule, { logger: false });
    app.setGlobalPrefix("api");
    app.use(createSecurityMiddleware());
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address !== "object" || address === null) throw new Error("Test server did not start.");
    apiOrigin = `http://127.0.0.1:${address.port}/api`;
  });

  afterEach(async () => {
    await app?.close();
  });

  it("keeps plan in an HttpOnly cookie, verifies the local QA link, then activates only after confirmation", async () => {
    const intentResponse = await post("/registration-intents", { plan: "FALTON" });
    expect(intentResponse.status).toBe(201);
    const intentCookie = cookieFrom(intentResponse);
    expect(intentCookie).toMatch(/^grumphya_registration_intent=/);
    expect(intentResponse.headers.get("set-cookie")).toContain("HttpOnly");
    expect(await intentResponse.json()).toMatchObject({ expiresAt: expect.any(String) });

    const currentResponse = await get("/registration-intents/current", intentCookie);
    expect(await currentResponse.json()).toEqual({ plan: "FALTON" });
    const registrationResponse = await post("/registrations", REGISTRATION_BODY, intentCookie);
    expect(registrationResponse.status).toBe(202);
    expect(await registrationResponse.json()).toMatchObject({ status: "pending_email_verification", verificationExpiresAt: expect.any(String) });

    const localMailResponse = await get("/registration-test-mail/latest");
    const localMail = (await localMailResponse.json()) as { verificationUrl: string };
    const verificationToken = new URL(localMail.verificationUrl).hash.slice(1);
    const verifyResponse = await post("/registrations/verify", { token: verificationToken });
    expect(verifyResponse.status).toBe(201);
    const verifiedCookie = cookieFrom(verifyResponse);
    expect(await verifyResponse.json()).toEqual({ status: "email_verified", plan: "FALTON" });

    const confirmResponse = await post("/registrations/confirm", {}, verifiedCookie);
    expect(confirmResponse.status).toBe(201);
    expect(confirmResponse.headers.get("set-cookie")).toContain("grumphya_refresh=");
    expect(confirmResponse.headers.get("set-cookie")).toContain("HttpOnly");
    expect(await confirmResponse.json()).toMatchObject({ status: "active", plan: "FALTON", expiresIn: 600 });
  });

  it("rejects cookie-authenticated POSTs with a foreign origin or a non-JSON content type", async () => {
    const foreignOrigin = await fetch(`${apiOrigin}/registration-intents`, {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "ILUMINADO" }),
    });
    expect(foreignOrigin.status).toBe(403);
    const wrongContentType = await fetch(`${apiOrigin}/registration-intents`, {
      method: "POST",
      headers: { Origin: WEB_ORIGIN, "Content-Type": "text/plain" },
      body: JSON.stringify({ plan: "ILUMINADO" }),
    });
    expect(wrongContentType.status).toBe(415);
  });

  async function get(path: string, cookie?: string): Promise<Response> {
    return fetch(`${apiOrigin}${path}`, { headers: cookie ? { Cookie: cookie } : undefined });
  }

  async function post(path: string, body: object, cookie?: string): Promise<Response> {
    return fetch(`${apiOrigin}${path}`, {
      method: "POST",
      headers: {
        Origin: WEB_ORIGIN,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }
});

function cookieFrom(response: Response): string {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Expected an authentication cookie.");
  return cookie;
}
