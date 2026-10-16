import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSecurityMiddleware } from "../security/security.middleware";
import { RegistrationController } from "./registration.controller";
import { InMemoryRegistrationRepository } from "./registration-testing.repository";
import { REGISTRATION_REPOSITORY } from "./registration.repository";
import { ACCESS_TOKEN_SESSION_LOOKUP } from "../infrastructure/auth/access-token-session.lookup";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";

const WEB_ORIGIN = "http://127.0.0.1:5173";
const REGISTRATION_BODY = {
  email: "Persona@example.es",
  username: "PersonaLista",
  password: "Una contraseña suficientemente segura 48!",
  privacyPolicyAcknowledged: true,
};

let repository = new InMemoryRegistrationRepository();

class RegistrationHttpTestModule {}
Module({
  controllers: [RegistrationController],
  providers: [
    {
      provide: REGISTRATION_REPOSITORY,
      useFactory: () => repository,
    },
    AccessTokenGuard,
    {
      provide: ACCESS_TOKEN_SESSION_LOOKUP,
      useFactory: () => ({
        isActive: (tokenHash: string, userId: string) =>
          repository.isActive(tokenHash, userId),
      }),
    },
  ],
})(RegistrationHttpTestModule);

describe("registration HTTP flow", () => {
  let app: NestExpressApplication;
  let apiOrigin: string;

  beforeEach(async () => {
    process.env.WEB_ORIGIN = WEB_ORIGIN;
    process.env.ACCESS_TOKEN_SECRET =
      "registration-http-test-secret-with-at-least-32-bytes";
    repository = new InMemoryRegistrationRepository();
    app = await NestFactory.create<NestExpressApplication>(
      RegistrationHttpTestModule,
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

  it("keeps the selected plan server-side and activates the simulated subscription atomically", async () => {
    const intentResponse = await post("/registration-intents", {
      plan: "FALTON",
    });
    expect(intentResponse.status).toBe(201);
    const intentCookie = cookieFrom(intentResponse);
    expect(intentCookie).toMatch(/^grumphya_registration_intent=/);
    expect(intentResponse.headers.get("set-cookie")).toContain("HttpOnly");
    expect(await intentResponse.json()).toMatchObject({
      expiresAt: expect.any(String),
    });

    const currentResponse = await get(
      "/registration-intents/current",
      intentCookie,
    );
    expect(await currentResponse.json()).toEqual({ plan: "FALTON" });
    const registrationResponse = await post(
      "/registrations",
      REGISTRATION_BODY,
      intentCookie,
    );
    expect(registrationResponse.status).toBe(201);
    expect(registrationResponse.headers.get("set-cookie")).toContain(
      "grumphya_refresh=",
    );
    expect(registrationResponse.headers.get("set-cookie")).toContain(
      "HttpOnly",
    );
    const registrationBody = await registrationResponse.json();
    expect(registrationBody).toMatchObject({
      status: "active",
      plan: "FALTON",
      expiresIn: 600,
      account: {
        user: {
          email: "persona@example.es",
          username: "PersonaLista",
          emailVerified: false,
          createdAt: expect.any(String),
        },
      },
    });
    expect(registrationBody.account.plans).toEqual(
      expect.arrayContaining([
        {
          plan: "FALTON",
          status: "active",
          attemptsRemaining: { ideas: 0, roasts: 11 },
          startsAt: expect.any(String),
          expiresAt: expect.any(String),
        },
        {
          plan: "ILUMINADO",
          status: "inactive",
          attemptsRemaining: { ideas: 0, roasts: 0 },
          startsAt: null,
          expiresAt: null,
        },
      ]),
    );
    const refreshCookie = cookieFrom(registrationResponse);
    const accessToken = registrationBody.accessToken as string;
    const cookieOnlyProfile = await get("/account/profile", refreshCookie);
    expect(cookieOnlyProfile.status).toBe(401);
    const profileResponse = await getProtected("/account/profile", accessToken);
    expect(profileResponse.status).toBe(200);
    expect(await profileResponse.json()).toMatchObject({
      user: { emailVerified: false },
    });
    const ownerId = repository.users[0]?.id;
    if (!ownerId) throw new Error("Registered user is missing in test store.");
    repository.goodIdeas.push(
      {
        id: "00000000-0000-4000-8000-000000000011",
        userId: ownerId,
        title: "Idea aprobada propia",
        createdAt: "2026-10-16T12:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000012",
        userId: "00000000-0000-4000-8000-000000000099",
        title: "Idea privada ajena",
        createdAt: "2026-10-16T13:00:00.000Z",
      },
    );
    const goodIdeasResponse = await getProtected(
      "/account/good-ideas?userId=00000000-0000-4000-8000-000000000099",
      accessToken,
    );
    expect(goodIdeasResponse.status).toBe(200);
    expect(await goodIdeasResponse.json()).toEqual({
      ideas: [
        {
          id: "00000000-0000-4000-8000-000000000011",
          title: "Idea aprobada propia",
          createdAt: "2026-10-16T12:00:00.000Z",
        },
      ],
    });
    const purchaseResponse = await postProtected(
      "/account/subscriptions/purchase",
      { plan: "ILUMINADO" },
      accessToken,
      "8a4e1c42-e198-4db3-b4a8-910e25c8b6d1",
    );
    expect(purchaseResponse.status).toBe(201);
    const purchasedProfile = await purchaseResponse.json();
    expect(purchasedProfile.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          plan: "ILUMINADO",
          status: "active",
          attemptsRemaining: { ideas: 11, roasts: 0 },
        }),
      ]),
    );
    const activePurchaseResponse = await postProtected(
      "/account/subscriptions/purchase",
      { plan: "FALTON" },
      accessToken,
      "b4e1c42e-198e-4db3-b4a8-910e25c8b6d1",
    );
    expect(activePurchaseResponse.status).toBe(409);
  });

  it("logs in, rotates the refresh cookie, and revokes the session on logout", async () => {
    const intentResponse = await post("/registration-intents", {
      plan: "ILUMINADO",
    });
    const registrationResponse = await post(
      "/registrations",
      REGISTRATION_BODY,
      cookieFrom(intentResponse),
    );
    expect(registrationResponse.status).toBe(201);
    const registrationBody = await registrationResponse.json();

    const loginResponse = await post("/auth/login", {
      identifier: "PersonaLista",
      password: REGISTRATION_BODY.password,
      rememberMe: true,
    });
    expect(loginResponse.status).toBe(201);
    const loginSetCookie = loginResponse.headers.get("set-cookie") ?? "";
    expect(loginSetCookie).toContain("grumphya_refresh=");
    expect(loginSetCookie).toContain("HttpOnly");
    expect(loginSetCookie).toContain("SameSite=Strict");
    expect(loginSetCookie).toContain("Max-Age=2592000");
    const loginBody = await loginResponse.json();
    expect(loginBody).toMatchObject({
      status: "active",
      expiresIn: 600,
      accessToken: expect.any(String),
    });
    expect(loginBody.accessToken).not.toBe(registrationBody.accessToken);
    const originalRefreshCookie = cookieFrom(loginResponse);

    const refreshResponse = await post(
      "/auth/refresh",
      {},
      originalRefreshCookie,
    );
    expect(refreshResponse.status).toBe(201);
    const rotatedCookie = cookieFrom(refreshResponse);
    expect(rotatedCookie).not.toBe(originalRefreshCookie);
    const refreshBody = await refreshResponse.json();
    expect(refreshBody).toMatchObject({
      expiresIn: 600,
      accessToken: expect.any(String),
    });
    const staleRefreshResponse = await post(
      "/auth/refresh",
      {},
      originalRefreshCookie,
    );
    expect(staleRefreshResponse.status).toBe(401);

    // A logout request already in flight when refresh rotates may carry the
    // previous cookie; it must still revoke the same server-side session.
    const logoutResponse = await post(
      "/auth/logout",
      {},
      originalRefreshCookie,
    );
    expect(logoutResponse.status).toBe(201);
    expect(logoutResponse.headers.get("set-cookie")).toContain(
      "grumphya_refresh=;",
    );
    expect(logoutResponse.headers.get("set-cookie")).toContain("HttpOnly");
    const revokedRefreshResponse = await post(
      "/auth/refresh",
      {},
      rotatedCookie,
    );
    expect(revokedRefreshResponse.status).toBe(401);
    const revokedAccessResponse = await getProtected(
      "/account/profile",
      refreshBody.accessToken,
    );
    expect(revokedAccessResponse.status).toBe(401);
  });

  it("returns one generic login error for an unknown account and a wrong password", async () => {
    const intentResponse = await post("/registration-intents", {
      plan: "ILUMINADO",
    });
    const registrationResponse = await post(
      "/registrations",
      REGISTRATION_BODY,
      cookieFrom(intentResponse),
    );
    expect(registrationResponse.status).toBe(201);
    const unknownUser = await post("/auth/login", {
      identifier: "NoExiste",
      password: REGISTRATION_BODY.password,
      rememberMe: false,
    });
    const wrongPassword = await post("/auth/login", {
      identifier: "PersonaLista",
      password: "Otra clave válida 2026!",
      rememberMe: false,
    });

    expect(unknownUser.status).toBe(401);
    expect(await unknownUser.json()).toEqual(await wrongPassword.json());
    expect(unknownUser.headers.get("set-cookie")).toBeNull();
  });

  it("rejects cookie-authenticated POSTs with a foreign origin or a non-JSON content type", async () => {
    const foreignOrigin = await fetch(`${apiOrigin}/registration-intents`, {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
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
    return fetch(`${apiOrigin}${path}`, {
      headers: cookie ? { Cookie: cookie } : undefined,
    });
  }

  async function getProtected(
    path: string,
    accessToken: string,
  ): Promise<Response> {
    return fetch(`${apiOrigin}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async function post(
    path: string,
    body: object,
    cookie?: string,
  ): Promise<Response> {
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

  async function postProtected(
    path: string,
    body: object,
    accessToken: string,
    idempotencyKey?: string,
  ): Promise<Response> {
    return fetch(`${apiOrigin}${path}`, {
      method: "POST",
      headers: {
        Origin: WEB_ORIGIN,
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
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
