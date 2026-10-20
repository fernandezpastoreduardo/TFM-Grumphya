import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PasswordResetTarget,
  PasswordResetRepository,
} from "./password-reset.repository";
import { PasswordResetService } from "./password-reset.service";

const ACTIVE_EMAIL = "persona@example.com";
const GENERIC_MESSAGE =
  "Si existe una cuenta activa con ese correo, recibirás instrucciones para cambiar la contraseña.";
const WEB_ORIGIN = "https://grumphya.example";

class MemoryPasswordResetRepository implements PasswordResetRepository {
  activeUsers = new Map([
    [ACTIVE_EMAIL, { userId: "user-1", email: ACTIVE_EMAIL }],
  ]);
  requests = new Map<string, { count: number; lastRequestedAt: number }>();
  tokens = new Map<string, { userId: string; expiresAt: Date }>();
  revokedSessions = new Set<string>();
  passwordHashes = new Map<string, string>();

  async replaceToken(
    email: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetTarget | null> {
    const target = this.activeUsers.get(email);
    if (!target) return null;
    const now = Date.now();
    const previous = this.requests.get(target.userId);
    if (
      previous &&
      (now - previous.lastRequestedAt < 60_000 || previous.count >= 3)
    )
      return null;
    this.requests.set(target.userId, {
      count: (previous?.count ?? 0) + 1,
      lastRequestedAt: now,
    });
    for (const [hash] of this.tokens) this.tokens.delete(hash);
    this.tokens.set(tokenHash, { userId: target.userId, expiresAt });
    return target;
  }

  async consumeToken(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    const token = this.tokens.get(tokenHash);
    if (!token || token.expiresAt.getTime() <= Date.now()) return false;
    this.tokens.delete(tokenHash);
    this.passwordHashes.set(token.userId, passwordHash);
    this.revokedSessions.add(token.userId);
    return true;
  }

  async invalidateToken(userId: string, tokenHash: string): Promise<void> {
    if (this.tokens.get(tokenHash)?.userId === userId)
      this.tokens.delete(tokenHash);
  }
}

function makeService(
  repository: MemoryPasswordResetRepository,
  send = vi.fn(),
) {
  return new PasswordResetService(repository, { send });
}

const PASSWORD = "NuevaClaveSegura42!";

beforeEach(() => {
  vi.stubEnv("WEB_ORIGIN", WEB_ORIGIN);
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => vi.unstubAllEnvs());

describe("PasswordResetService", () => {
  it("returns the same generic message and response floor for existing and missing accounts", async () => {
    const repository = new MemoryPasswordResetRepository();
    const send = vi.fn(() => new Promise<never>(() => undefined));
    const service = makeService(repository, send);
    const durations: number[] = [];
    for (const email of [ACTIVE_EMAIL, "nobody@example.com"]) {
      const startedAt = Date.now();
      const result = await service.request({ email });
      durations.push(Date.now() - startedAt);
      expect(result).toEqual({ message: GENERIC_MESSAGE });
    }
    expect(durations.every((duration) => duration >= 430)).toBe(true);
    expect(send).toHaveBeenCalledOnce();
  });

  it("normalizes internationalized email domains like registration", async () => {
    const repository = new MemoryPasswordResetRepository();
    repository.activeUsers.set("persona@xn--exmple-cua.de", {
      userId: "user-idn",
      email: "persona@xn--exmple-cua.de",
    });
    const send = vi.fn().mockResolvedValue("sent");
    const service = makeService(repository, send);
    await service.request({ email: "persona@exämple.de" });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toMatchObject({
      to: "persona@xn--exmple-cua.de",
    });
  });

  it("keeps the generic response when SMTP fails and invalidates its token", async () => {
    const repository = new MemoryPasswordResetRepository();
    const send = vi.fn().mockRejectedValue(new Error("SMTP unavailable"));
    const service = makeService(repository, send);
    await expect(service.request({ email: ACTIVE_EMAIL })).resolves.toEqual({
      message: GENERIC_MESSAGE,
    });
    await vi.waitFor(() => expect(repository.tokens.size).toBe(0));
    expect(send).toHaveBeenCalledOnce();
  });

  it("sends an absolute HTTPS link and stores only a token hash", async () => {
    const repository = new MemoryPasswordResetRepository();
    const send = vi.fn().mockResolvedValue("sent");
    const service = makeService(repository, send);
    await service.request({ email: ACTIVE_EMAIL });
    const message = send.mock.calls[0]![0] as { html: string; text: string };
    expect(message.html).toContain(`${WEB_ORIGIN}/restablecer-contrasena#`);
    expect(message.text).toContain(`${WEB_ORIGIN}/restablecer-contrasena#`);
    const urlToken = /#([a-f0-9]{64})/u.exec(message.text)?.[1];
    expect(urlToken).toBeTruthy();
    expect(repository.tokens.has(urlToken!)).toBe(false);
    expect(repository.tokens.size).toBe(1);
    expect(message.text).not.toContain(PASSWORD);
  });

  it("replaces prior tokens, expires them, consumes once, and revokes active sessions", async () => {
    const repository = new MemoryPasswordResetRepository();
    const service = makeService(repository);
    await service.request({ email: ACTIVE_EMAIL });
    const priorTokenHash = [...repository.tokens.keys()][0]!;
    repository.requests.get("user-1")!.lastRequestedAt = Date.now() - 61_000;
    await service.request({ email: ACTIVE_EMAIL });
    expect(repository.tokens.has(priorTokenHash)).toBe(false);
    const currentTokenHash = [...repository.tokens.keys()][0]!;

    const expired = repository.tokens.get(currentTokenHash)!;
    expired.expiresAt = new Date(Date.now() - 1);
    expect(await repository.consumeToken(currentTokenHash, "hash")).toBe(false);

    repository.tokens.set(currentTokenHash, {
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const outcomes = await Promise.all([
      repository.consumeToken(currentTokenHash, "hash-1"),
      repository.consumeToken(currentTokenHash, "hash-2"),
    ]);
    expect(outcomes.sort()).toEqual([false, true]);
    expect(repository.revokedSessions.has("user-1")).toBe(true);
    expect(repository.tokens.has(currentTokenHash)).toBe(false);
  });

  it("enforces per-account cooldown and request cap without changing the response", async () => {
    const repository = new MemoryPasswordResetRepository();
    const service = makeService(repository);
    await expect(service.request({ email: ACTIVE_EMAIL })).resolves.toEqual({
      message: GENERIC_MESSAGE,
    });
    await expect(service.request({ email: ACTIVE_EMAIL })).resolves.toEqual({
      message: GENERIC_MESSAGE,
    });
    expect(repository.tokens.size).toBe(1);
    for (let count = 0; count < 3; count += 1) {
      const request = repository.requests.get("user-1")!;
      request.lastRequestedAt = Date.now() - 61_000;
      if (count === 0) request.count = 1;
      if (count === 1) request.count = 2;
      if (count === 2) request.count = 3;
      await service.request({ email: ACTIVE_EMAIL });
    }
    expect(repository.requests.get("user-1")?.count).toBe(3);
  });

  it("rejects invalid password and expired or reused links", async () => {
    const repository = new MemoryPasswordResetRepository();
    const service = makeService(repository);
    await expect(
      service.complete({ token: "0".repeat(64), password: "weak" }),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    await expect(
      service.complete({ token: "0".repeat(64), password: PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_LINK" });
  });
});
