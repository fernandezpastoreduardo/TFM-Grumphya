import { describe, expect, it } from "vitest";
import { RegistrationService, verifyPassword } from "./registration.service";
import { InMemoryRegistrationRepository } from "./registration-testing.repository";
import { InMemoryVerificationDelivery } from "./verification-delivery";

const validRegistration = {
  email: "Person@example.com",
  username: "Persona",
  password: "Una clave segura 2026!",
  privacyPolicyAcknowledged: true,
};

describe("register with plan", () => {
  it("creates an expiring intent for a supported plan", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = new RegistrationService(repository, new InMemoryVerificationDelivery());
    const intent = await service.createIntent("ILUMINADO");
    expect(intent.plan).toBe("ILUMINADO");
    expect(intent.token).toHaveLength(64);
  });

  it("creates a pending registration and stores only a password hash", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = new RegistrationService(repository, new InMemoryVerificationDelivery());
    const intent = await service.createIntent("FALTON");
    const result = await service.register(intent.token, validRegistration);
    expect(result.status).toBe("pending_email_verification");
    const user = repository.users[0];
    expect(user.email).toBe("person@example.com");
    expect(user.username).toBe("persona");
    expect(user.passwordHash).not.toContain(validRegistration.password);
    expect(await verifyPassword(validRegistration.password, user.passwordHash)).toBe(true);
    expect(await verifyPassword("incorrect password", user.passwordHash)).toBe(false);
    expect(repository.registrations[0]?.plan).toBe("FALTON");
  });

  it("returns the same generic conflict for duplicate email and username", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = new RegistrationService(repository, new InMemoryVerificationDelivery());
    const firstIntent = await service.createIntent("ILUMINADO");
    await service.register(firstIntent.token, validRegistration);
    const duplicateEmailIntent = await service.createIntent("FALTON");
    const duplicateNameIntent = await service.createIntent("FALTON");
    const [duplicateEmail, duplicateUsername] = await Promise.allSettled([
      service.register(duplicateEmailIntent.token, { ...validRegistration, username: "Otra" }),
      service.register(duplicateNameIntent.token, { ...validRegistration, email: "otra@example.com" }),
    ]);
    const emailConflict = publicError(duplicateEmail.status === "rejected" ? duplicateEmail.reason : duplicateEmail.value);
    const usernameConflict = publicError(duplicateUsername.status === "rejected" ? duplicateUsername.reason : duplicateUsername.value);
    expect(emailConflict).toEqual(usernameConflict);
    expect(emailConflict).toMatchObject({ statusCode: 409, code: "REGISTRATION_UNAVAILABLE" });
  });

  it("requires acknowledged privacy policy and a syntactically valid email", async () => {
    const service = new RegistrationService(new InMemoryRegistrationRepository(), new InMemoryVerificationDelivery());
    const intent = await service.createIntent("ILUMINADO");
    await expect(service.register(intent.token, { ...validRegistration, privacyPolicyAcknowledged: false })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.register(intent.token, { ...validRegistration, email: "no" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("normalizes international email domains and Unicode usernames, and rejects malformed aliases or controls", async () => {
    const repository = new InMemoryRegistrationRepository();
    const service = new RegistrationService(repository, new InMemoryVerificationDelivery());
    const intent = await service.createIntent("ILUMINADO");
    await service.register(intent.token, { ...validRegistration, email: " Persona@mañana.es ", username: "Cafe\u0301Lista" });
    expect(repository.users[0]?.email).toBe("persona@xn--maana-pta.es");
    expect(repository.users[0]?.username).toBe("cafélista");

    const malformedAliasIntent = await service.createIntent("FALTON");
    await expect(service.register(malformedAliasIntent.token, { ...validRegistration, username: "Nombre__otro" })).rejects.toMatchObject({ code: "INVALID_USERNAME" });
    const controlPasswordIntent = await service.createIntent("FALTON");
    await expect(service.register(controlPasswordIntent.token, { ...validRegistration, password: "Clave suficientemente larga\n" })).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
  });

  it("requires verification before idempotently activating a subscription", async () => {
    const repository = new InMemoryRegistrationRepository();
    const delivery = new InMemoryVerificationDelivery();
    const service = new RegistrationService(repository, delivery);
    const intent = await service.createIntent("ILUMINADO");
    await service.register(intent.token, validRegistration);
    await expect(service.confirm("missing")).rejects.toMatchObject({ statusCode: 400 });
    const verified = await service.verify(delivery.lastToken!);
    const first = await service.confirm(verified.confirmationToken);
    expect(first.result).toMatchObject({ status: "active", plan: "ILUMINADO", expiresIn: 600 });
    expect(first.result.accessToken).toHaveLength(64);
    expect(first.refreshToken).toHaveLength(64);
    expect(repository.sessions).toHaveLength(1);
    const refreshed = await service.refresh(first.refreshToken);
    expect(refreshed.result.plan).toBe("ILUMINADO");
    expect(refreshed.refreshToken).not.toBe(first.refreshToken);
    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(repository.subscriptions).toHaveLength(1);
    expect(repository.subscriptions[0]?.plan).toBe("ILUMINADO");
  });
});

function publicError(error: unknown) {
  if (typeof error !== "object" || error === null || !("response" in error)) return error;
  const typed = error as { statusCode?: number; code?: string; response?: unknown };
  return { statusCode: typed.statusCode, code: typed.code, response: typed.response };
}
