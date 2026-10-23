import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword as verifyPasswordHash } from "../infrastructure/auth/password-hasher";
import {
  hashToken,
  RegistrationService,
  verifyPassword,
} from "./registration.service";
import { InMemoryRegistrationRepository } from "./registration-testing.repository";

const validRegistration = {
  email: "Person@example.com",
  username: "Persona",
  password: "Una clave segura 2026!",
  privacyPolicyAcknowledged: true,
};
const JWT_TEST_SECRET = "registration-test-jwt-secret-with-32-bytes-min";
const LEGACY_SCRYPT_HASH =
  "scrypt$00112233445566778899aabbccddeeff$a93fa84b70923122587058ae0f2e8acb917268e2773ae0eaf2cdd764f829395899384239d564fa901a58a30f0ecc37799a4aa764298a348814a22787e22f0bf6";
const verificationTokens = new WeakMap<RegistrationService, string>();

describe("register with plan", () => {
  beforeEach(() => {
    process.env.ACCESS_TOKEN_SECRET = JWT_TEST_SECRET;
    process.env.WEB_ORIGIN = "http://127.0.0.1:5173";
  });

  afterEach(() => {
    delete process.env.ACCESS_TOKEN_SECRET;
    delete process.env.WEB_ORIGIN;
  });

  it("creates an expiring intent for a supported plan", async () => {
    const service = makeService(new InMemoryRegistrationRepository());
    const intent = await service.createIntent("ILUMINADO");
    expect(intent.plan).toBe("ILUMINADO");
    expect(intent.token).toHaveLength(64);
  });

  it("does not activate the account or issue a session before email verification", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = makeService(repository);
    const intent = await service.createIntent("FALTON");
    const pending = await service.register(intent.token, validRegistration);
    const user = repository.users[0];
    expect(pending).toEqual({ status: "verification_pending" });
    expect(repository.sessions).toHaveLength(0);
    expect(repository.subscriptions).toHaveLength(0);
    expect(repository.registrations[0]?.verificationHash).toBe(
      hashToken(verificationTokens.get(service) ?? ""),
    );
    expect(user?.passwordHash).not.toContain(validRegistration.password);
    expect(
      await verifyPassword(validRegistration.password, user!.passwordHash),
    ).toBe(true);
    expect(await verifyPassword("incorrect password", user!.passwordHash)).toBe(
      false,
    );
    const activated = await verifyAndConfirm(service);
    expect(activated.result).toMatchObject({
      status: "active",
      plan: "FALTON",
    });
    expect(repository.sessions).toHaveLength(1);
    expect(repository.subscriptions).toEqual([
      { userId: user?.id, plan: "FALTON", status: "active" },
    ]);
  });

  it("returns the same generic conflict for duplicate email and username", async () => {
    const service = makeService(new InMemoryRegistrationRepository());
    const firstIntent = await service.createIntent("ILUMINADO");
    await service.register(firstIntent.token, validRegistration);
    const duplicateEmailIntent = await service.createIntent("FALTON");
    const duplicateNameIntent = await service.createIntent("FALTON");
    const [duplicateEmail, duplicateUsername] = await Promise.allSettled([
      service.register(duplicateEmailIntent.token, {
        ...validRegistration,
        username: "Otra",
      }),
      service.register(duplicateNameIntent.token, {
        ...validRegistration,
        email: "otra@example.com",
      }),
    ]);
    expect(duplicateEmail).toMatchObject({
      status: "fulfilled",
      value: { status: "verification_pending" },
    });
    expect(duplicateUsername).toMatchObject({
      status: "fulfilled",
      value: { status: "verification_pending" },
    });
  });

  it("keeps a failed SMTP registration pending and allows a limited resend with token rotation", async () => {
    const repository = new InMemoryRegistrationRepository();
    const tokens: string[] = [];
    const send = vi.fn(async ({ text }: { text: string }) => {
      const token = /#([a-f0-9]{64})/u.exec(text)?.[1];
      if (token) tokens.push(token);
      return "sent" as const;
    });
    send.mockImplementationOnce(async ({ text }) => {
      const token = /#([a-f0-9]{64})/u.exec(text)?.[1];
      if (token) tokens.push(token);
      throw new Error("SMTP refused");
    });
    const service = new RegistrationService(repository, { send });
    const intent = await service.createIntent("ILUMINADO");

    await expect(
      service.register(intent.token, validRegistration),
    ).resolves.toEqual({ status: "verification_pending" });
    expect(repository.sessions).toHaveLength(0);
    expect(repository.subscriptions).toHaveLength(0);
    expect(repository.registrations[0]!.lastSentAt).toBeLessThan(
      Date.now() - 60_000,
    );
    const replaceToken = vi.spyOn(repository, "replaceVerificationToken");

    await service.resendVerification({ email: validRegistration.email });
    expect(replaceToken).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(2);
    expect(tokens).toHaveLength(2);
    await expect(service.verify(tokens[0]!)).rejects.toMatchObject({
      code: "INVALID_VERIFICATION",
    });
    const deliveryCountAfterFirstResend = send.mock.calls.length;
    await service.resendVerification({ email: validRegistration.email });
    expect(send).toHaveBeenCalledTimes(deliveryCountAfterFirstResend);
    for (let resendNumber = 1; resendNumber < 5; resendNumber += 1) {
      repository.registrations[0]!.lastSentAt = Date.now() - 61_000;
      await service.resendVerification({ email: validRegistration.email });
    }
    repository.registrations[0]!.lastSentAt = Date.now() - 61_000;
    await service.resendVerification({ email: validRegistration.email });
    expect(send).toHaveBeenCalledTimes(6);
    await expect(service.verify(tokens.at(-1)!)).resolves.toMatchObject({
      result: { status: "email_verified" },
    });
  });

  it("rejects expired and reused verification tokens", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = makeService(repository);
    const intent = await service.createIntent("FALTON");
    await service.register(intent.token, validRegistration);
    const token = verificationTokens.get(service)!;
    repository.registrations[0]!.verificationExpiresAt = new Date(
      Date.now() - 1,
    );

    await expect(service.verify(token)).rejects.toMatchObject({
      code: "INVALID_VERIFICATION",
    });
    repository.registrations[0]!.verificationExpiresAt = new Date(
      Date.now() + 60_000,
    );
    const verified = await service.verify(token);
    await expect(service.verify(token)).rejects.toMatchObject({
      code: "INVALID_VERIFICATION",
    });
    await expect(
      service.confirm(verified.confirmationToken),
    ).resolves.toMatchObject({
      result: { status: "active" },
    });
    await expect(
      service.confirm(verified.confirmationToken),
    ).rejects.toMatchObject({
      code: "VERIFICATION_REQUIRED",
    });
  });

  it("requires an acknowledged privacy policy and a syntactically valid email", async () => {
    const service = makeService(new InMemoryRegistrationRepository());
    const intent = await service.createIntent("ILUMINADO");
    await expect(
      service.register(intent.token, {
        ...validRegistration,
        privacyPolicyAcknowledged: false,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.register(intent.token, { ...validRegistration, email: "no" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("reserves the admin username regardless of letter casing", async () => {
    const service = makeService(new InMemoryRegistrationRepository());
    const intent = await service.createIntent("ILUMINADO");

    await expect(
      service.register(intent.token, {
        ...validRegistration,
        username: "Jappy",
      }),
    ).rejects.toMatchObject({ code: "INVALID_USERNAME" });
  });

  it("requires a long password with uppercase, lowercase, number and special character", async () => {
    const service = makeService(new InMemoryRegistrationRepository());
    const weakPasswords = [
      "una clave larga 2026!",
      "UNA CLAVE LARGA 2026!",
      "Una clave larga segura!",
      "UnaClaveLarga2026",
    ];
    for (const password of weakPasswords) {
      const intent = await service.createIntent("ILUMINADO");
      await expect(
        service.register(intent.token, { ...validRegistration, password }),
      ).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    }
  });

  it("rejects unexpected payload fields instead of silently accepting them", async () => {
    const service = makeService(new InMemoryRegistrationRepository());
    const intent = await service.createIntent("ILUMINADO");
    await expect(
      service.register(intent.token, { ...validRegistration, role: "admin" }),
    ).rejects.toMatchObject({ code: "INVALID_REGISTRATION" });
  });

  it("normalizes international email domains and Unicode usernames, and rejects malformed input", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = makeService(repository);
    const intent = await service.createIntent("ILUMINADO");
    await service.register(intent.token, {
      ...validRegistration,
      email: " Persona@mañana.es ",
      username: "Cafe\u0301Lista",
    });
    expect(repository.users[0]?.email).toBe("persona@xn--maana-pta.es");
    expect(repository.users[0]?.username).toBe("CaféLista");
    const malformedAliasIntent = await service.createIntent("FALTON");
    await expect(
      service.register(malformedAliasIntent.token, {
        ...validRegistration,
        username: "Nombre__otro",
      }),
    ).rejects.toMatchObject({ code: "INVALID_USERNAME" });
    const controlPasswordIntent = await service.createIntent("FALTON");
    await expect(
      service.register(controlPasswordIntent.token, {
        ...validRegistration,
        password: "Clave suficientemente larga\n",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
  });

  it("returns the profile and lets an account purchase an inactive plan only once", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = makeService(repository);
    const intent = await service.createIntent("ILUMINADO");
    const session = await registerAndConfirm(
      service,
      intent.token,
      validRegistration,
    );
    const profile = await service.accountProfile(session.refreshToken);
    const faltonPlan = profile.plans.find((plan) => plan.plan === "FALTON");
    const iluminadoPlan = profile.plans.find(
      (plan) => plan.plan === "ILUMINADO",
    );
    expect(faltonPlan).toMatchObject({
      plan: "FALTON",
      status: "inactive",
      attemptsRemaining: { ideas: 0, roasts: 0 },
    });
    expect(iluminadoPlan).toMatchObject({
      plan: "ILUMINADO",
      status: "active",
      attemptsRemaining: { ideas: 11, roasts: 0 },
    });
    const userId = repository.users[0]!.id;
    const purchased = await service.purchasePlanForUser(
      userId,
      "FALTON",
      "8a4e1c42-e198-4db3-b4a8-910e25c8b6d1",
    );
    expect(
      purchased.plans.find((plan) => plan.plan === "FALTON"),
    ).toMatchObject({
      plan: "FALTON",
      status: "active",
      attemptsRemaining: { ideas: 0, roasts: 11 },
    });
    await expect(
      service.purchasePlanForUser(
        userId,
        "FALTON",
        "8a4e1c42-e198-4db3-b4a8-910e25c8b6d1",
      ),
    ).resolves.toMatchObject({
      plans: expect.arrayContaining([
        expect.objectContaining({ plan: "FALTON", status: "active" }),
      ]),
    });
    await expect(
      service.purchasePlanForUser(
        userId,
        "FALTON",
        "b4e1c42e-198e-4db3-b4a8-910e25c8b6d1",
      ),
    ).rejects.toMatchObject({ code: "PLAN_ALREADY_ACTIVE" });
    const refreshed = await service.refresh(session.refreshToken);
    expect(
      refreshed.result.account.plans.find((plan) => plan.plan === "ILUMINADO"),
    ).toMatchObject({ status: "active" });
    await expect(service.refresh(session.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("returns approved ideas for the requested session owner in newest-first order", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = makeService(repository);
    const intent = await service.createIntent("ILUMINADO");
    await registerAndConfirm(service, intent.token, validRegistration);
    const ownerId = repository.users[0]!.id;
    repository.goodIdeas.push(
      {
        id: "00000000-0000-4000-8000-000000000002",
        userId: ownerId,
        title: "Idea aprobada reciente",
        createdAt: "2026-10-16T12:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000001",
        userId: ownerId,
        title: "Idea aprobada anterior",
        createdAt: "2026-10-14T12:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        userId: "00000000-0000-4000-8000-000000000099",
        title: "Idea privada de otra cuenta",
        createdAt: "2026-10-17T12:00:00.000Z",
      },
    );

    await expect(service.getUserGoodIdeas(ownerId)).resolves.toEqual({
      ideas: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          title: "Idea aprobada reciente",
          createdAt: "2026-10-16T12:00:00.000Z",
        },
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "Idea aprobada anterior",
          createdAt: "2026-10-14T12:00:00.000Z",
        },
      ],
    });
  });

  it("loads the dynamic profile for a verified access-token owner id", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = makeService(repository);
    const intent = await service.createIntent("FALTON");
    await registerAndConfirm(service, intent.token, validRegistration);
    const ownerId = repository.users[0]!.id;

    await expect(service.getUserProfile(ownerId)).resolves.toMatchObject({
      user: {
        email: "person@example.com",
        username: "Persona",
        emailVerified: true,
      },
      plans: expect.arrayContaining([
        expect.objectContaining({
          plan: "FALTON",
          status: "active",
          attemptsRemaining: { ideas: 0, roasts: 11 },
        }),
      ]),
    });
  });

  it("records and can revoke voluntary public ranking consent", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = makeService(repository);
    const intent = await service.createIntent("FALTON");
    await registerAndConfirm(service, intent.token, validRegistration);
    const ownerId = repository.users[0]!.id;

    await expect(
      service.setPublicRankingsOptIn(ownerId, true),
    ).resolves.toMatchObject({
      user: { publicRankingsOptIn: true },
    });
    await expect(
      service.setPublicRankingsOptIn(ownerId, false),
    ).resolves.toMatchObject({
      user: { publicRankingsOptIn: false },
    });
  });

  it("rejects a malformed owner id before querying approved ideas", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = makeService(repository);

    await expect(
      service.getUserGoodIdeas("not-a-user-id"),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "SESSION_REQUIRED",
    });
    expect(repository.goodIdeas).toEqual([]);
  });

  it("logs in with normalized alias or email and issues a 30-day remembered session", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = makeService(repository);
    const intent = await service.createIntent("ILUMINADO");
    await registerAndConfirm(service, intent.token, validRegistration);

    const session = await service.login({
      identifier: " PERSONA ",
      password: validRegistration.password,
      rememberMe: true,
    });

    expect(session.result).toMatchObject({
      status: "active",
      expiresIn: 600,
      account: { user: { username: "Persona" } },
    });
    expect(session.rememberMe).toBe(true);
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      29 * 24 * 60 * 60 * 1000,
    );
    expect(repository.sessions.at(-1)?.rememberMe).toBe(true);
  });

  it("upgrades a legacy scrypt hash with an expected-hash conditional update", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = makeService(repository);
    const intent = await service.createIntent("ILUMINADO");
    await registerAndConfirm(service, intent.token, validRegistration);
    const user = repository.users[0];
    if (!user) throw new Error("Test account was not created.");
    user.passwordHash = LEGACY_SCRYPT_HASH;
    const updatePasswordHash = vi.spyOn(repository, "updatePasswordHash");

    await service.login({
      identifier: validRegistration.email,
      password: validRegistration.password,
      rememberMe: false,
    });

    expect(updatePasswordHash).toHaveBeenCalledOnce();
    const [updatedUserId, expectedHash, upgradedHash] =
      updatePasswordHash.mock.calls[0] ?? [];
    expect(updatedUserId).toBe(user.id);
    expect(expectedHash).toBe(LEGACY_SCRYPT_HASH);
    expect(upgradedHash).toMatch(/^bcrypt-sha256\$2b\$12\$/u);
    await expect(
      verifyPasswordHash(validRegistration.password, upgradedHash),
    ).resolves.toBe(true);
  });

  it("uses one generic error for an unknown account and an incorrect password", async () => {
    const service = makeService(new InMemoryRegistrationRepository());
    const attempts = await Promise.allSettled([
      service.login({
        identifier: "missing-user",
        password: validRegistration.password,
        rememberMe: false,
      }),
      service.login({
        identifier: "missing-user",
        password: "Incorrecta 2026!",
        rememberMe: false,
      }),
    ]);
    const errors = attempts.map((attempt) => {
      if (attempt.status === "fulfilled")
        throw new Error("Expected rejection.");
      return attempt.reason.getResponse();
    });

    expect(errors[0]).toEqual(errors[1]);
    expect(errors[0]).toMatchObject({ code: "LOGIN_UNAVAILABLE" });
  });
});

function makeService(repository: InMemoryRegistrationRepository) {
  const service = new RegistrationService(repository, {
    send: async ({ text }) => {
      const token = /#([a-f0-9]{64})/u.exec(text)?.[1];
      if (token) verificationTokens.set(service, token);
      return "sent";
    },
  });
  return service;
}

async function registerAndConfirm(
  service: RegistrationService,
  intentToken: string,
  input: typeof validRegistration = validRegistration,
) {
  await service.register(intentToken, input);
  return verifyAndConfirm(service);
}

async function verifyAndConfirm(service: RegistrationService) {
  const token = verificationTokens.get(service);
  if (!token) throw new Error("Test verification token was not captured.");
  const verification = await service.verify(token);
  return service.confirm(verification.confirmationToken);
}
