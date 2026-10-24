import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

const { runMigrationsMock } = vi.hoisted(() => ({
  runMigrationsMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../infrastructure/database/run-migrations", () => ({
  runMigrations: runMigrationsMock,
}));

import { PostgresRegistrationRepository } from "./postgres-registration.repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ACCESS_HASH = "access-token-hash";
const REFRESH_HASH = "refresh-token-hash";
const CLEANUP_BATCH_SIZE = 500;

describe("PostgresRegistrationRepository retention cleanup", () => {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const end = vi.fn();
  const repository = new PostgresRegistrationRepository({
    query,
    end,
  } as unknown as Pool);

  beforeEach(() => {
    query.mockClear().mockResolvedValue({ rows: [], rowCount: 0 });
    runMigrationsMock.mockClear().mockResolvedValue(undefined);
  });

  it("purges an indexed batch of expired intents before creating a new intent", async () => {
    await repository.createIntent(
      "ILUMINADO",
      "new-intent-hash",
      new Date("2030-01-01T00:00:00.000Z"),
    );

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("DELETE FROM registration_intents intent"),
      [CLEANUP_BATCH_SIZE],
    );
    expect(query.mock.calls[0]?.[0]).toContain("expires_at <= now()");
    expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO registration_intents"),
      ["new-intent-hash", "ILUMINADO", new Date("2030-01-01T00:00:00.000Z")],
    );
  });

  it("purges only revoked or expired sessions in a bounded batch before login session creation", async () => {
    await repository.createSession(
      USER_ID,
      ACCESS_HASH,
      REFRESH_HASH,
      new Date("2030-01-01T00:00:00.000Z"),
      false,
    );

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("DELETE FROM auth_sessions session"),
      [CLEANUP_BATCH_SIZE],
    );
    expect(query.mock.calls[0]?.[0]).toContain("revoked_at IS NOT NULL");
    expect(query.mock.calls[0]?.[0]).toContain("expires_at <= now()");
    expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO auth_sessions"),
      [
        USER_ID,
        ACCESS_HASH,
        REFRESH_HASH,
        new Date("2030-01-01T00:00:00.000Z"),
        false,
      ],
    );
  });

  it("revokes a session when logout arrives with its immediately previous refresh hash", async () => {
    await repository.revokeSession(REFRESH_HASH);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "(refresh_token_hash=$1 OR previous_refresh_token_hash=$1)",
      ),
      [REFRESH_HASH],
    );
  });

  it("stores and can revoke a versioned public ranking consent", async () => {
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      repository.setPublicRankingsOptIn(USER_ID, true),
    ).resolves.toBeNull();

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("public_rankings_consent_policy_version"),
      [USER_ID, true, "v2"],
    );
    expect(query.mock.calls[0]?.[0]).toContain("CASE WHEN $2 THEN now()");
  });

  it("records the current privacy policy version when registering an account", async () => {
    const clientQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ plan_code: "ILUMINADO" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: USER_ID }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: "pending-registration-id" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const client = {
      query: clientQuery,
      release: vi.fn(),
    };
    const registrationRepository = new PostgresRegistrationRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool);

    await registrationRepository.consumeIntentAndRegister(
      "intent-token-hash",
      {
        email: "persona@example.es",
        username: "Persona",
        password: "hashed-password",
        privacyPolicyAcknowledged: true,
      },
      "password-hash",
      "verification-hash",
      new Date("2026-10-25T00:00:00.000Z"),
    );

    const userInsert = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("privacy_policy_version"),
    );
    expect(userInsert?.[1]).toContain("v3");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
