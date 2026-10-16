import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegistrationService, verifyPassword } from "./registration.service";
import { InMemoryRegistrationRepository } from "./registration-testing.repository";

const validRegistration = {
  email: "Person@example.com",
  username: "Persona",
  password: "Una clave segura 2026!",
  privacyPolicyAcknowledged: true,
};
const JWT_TEST_SECRET = "registration-test-jwt-secret-with-32-bytes-min";

describe("register with plan", () => {
  beforeEach(() => {
    process.env.ACCESS_TOKEN_SECRET = JWT_TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.ACCESS_TOKEN_SECRET;
  });

  it("creates an expiring intent for a supported plan", async () => {
    const service = new RegistrationService(
      new InMemoryRegistrationRepository(),
    );
    const intent = await service.createIntent("ILUMINADO");
    expect(intent.plan).toBe("ILUMINADO");
    expect(intent.token).toHaveLength(64);
  });

  it("activates the account and plan, stores a password hash and returns plan quotas", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = new RegistrationService(repository);
    const intent = await service.createIntent("FALTON");
    const session = await service.register(intent.token, validRegistration);
    const user = repository.users[0];
    expect(session.result).toMatchObject({
      status: "active",
      plan: "FALTON",
      expiresIn: 600,
    });
    expect(session.result.account.user).toMatchObject({
      email: "person@example.com",
      emailVerified: false,
    });
    expect(session.result.account.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          plan: "FALTON",
          status: "active",
          attemptsRemaining: { ideas: 0, roasts: 11 },
        }),
        expect.objectContaining({
          plan: "ILUMINADO",
          status: "inactive",
          attemptsRemaining: { ideas: 0, roasts: 0 },
        }),
      ]),
    );
    expect(user?.passwordHash).not.toContain(validRegistration.password);
    expect(
      await verifyPassword(validRegistration.password, user!.passwordHash),
    ).toBe(true);
    expect(await verifyPassword("incorrect password", user!.passwordHash)).toBe(
      false,
    );
    expect(repository.sessions).toHaveLength(1);
    expect(repository.subscriptions).toEqual([
      { userId: user?.id, plan: "FALTON", status: "active" },
    ]);
  });

  it("returns the same generic conflict for duplicate email and username", async () => {
    const service = new RegistrationService(
      new InMemoryRegistrationRepository(),
    );
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
    const emailConflict = publicError(duplicateEmail);
    const usernameConflict = publicError(duplicateUsername);
    expect(emailConflict).toEqual(usernameConflict);
    expect(emailConflict).toMatchObject({
      statusCode: 409,
      code: "REGISTRATION_UNAVAILABLE",
    });
  });

  it("requires an acknowledged privacy policy and a syntactically valid email", async () => {
    const service = new RegistrationService(
      new InMemoryRegistrationRepository(),
    );
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

  it("requires a long password with uppercase, lowercase, number and special character", async () => {
    const service = new RegistrationService(
      new InMemoryRegistrationRepository(),
    );
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
    const service = new RegistrationService(
      new InMemoryRegistrationRepository(),
    );
    const intent = await service.createIntent("ILUMINADO");
    await expect(
      service.register(intent.token, { ...validRegistration, role: "admin" }),
    ).rejects.toMatchObject({ code: "INVALID_REGISTRATION" });
  });

  it("normalizes international email domains and Unicode usernames, and rejects malformed input", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = new RegistrationService(repository);
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
    const service = new RegistrationService(repository);
    const intent = await service.createIntent("ILUMINADO");
    const session = await service.register(intent.token, validRegistration);
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
    const service = new RegistrationService(repository);
    const intent = await service.createIntent("ILUMINADO");
    await service.register(intent.token, validRegistration);
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
    const service = new RegistrationService(repository);
    const intent = await service.createIntent("FALTON");
    await service.register(intent.token, validRegistration);
    const ownerId = repository.users[0]!.id;

    await expect(service.getUserProfile(ownerId)).resolves.toMatchObject({
      user: {
        email: "person@example.com",
        username: "Persona",
        emailVerified: false,
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

  it("rejects a malformed owner id before querying approved ideas", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = new RegistrationService(repository);

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
    const service = new RegistrationService(repository);
    const intent = await service.createIntent("ILUMINADO");
    await service.register(intent.token, validRegistration);

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

  it("uses one generic error for an unknown account and an incorrect password", async () => {
    const service = new RegistrationService(
      new InMemoryRegistrationRepository(),
    );
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

function publicError(result: PromiseSettledResult<unknown>) {
  if (result.status === "fulfilled")
    return { status: "fulfilled", value: result.value };
  const error = result.reason as unknown;
  if (typeof error !== "object" || error === null || !("response" in error))
    return error;
  const typed = error as {
    statusCode?: number;
    code?: string;
    response?: unknown;
  };
  return {
    statusCode: typed.statusCode,
    code: typed.code,
    response: typed.response,
  };
}
