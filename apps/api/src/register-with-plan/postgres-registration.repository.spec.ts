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
const VERIFIED_TOKEN_HASH = "verified-token-hash";
const NEXT_ACCESS_HASH = "next-access-token-hash";
const NEXT_REFRESH_HASH = "next-refresh-token-hash";
const PROFILE_CREATED_AT = new Date("2026-01-02T03:04:05.000Z");
const PROFILE_PLAN_START = new Date("2026-01-03T00:00:00.000Z");
const PROFILE_PLAN_END = new Date("2026-02-03T00:00:00.000Z");
const PROFILE_ROWS = [
  {
    user_id: USER_ID,
    email: "persona@example.es",
    username: "Persona",
    email_verified_at: PROFILE_CREATED_AT,
    user_created_at: PROFILE_CREATED_AT,
    roast_messages_sent: "12",
    role: "user",
    avatar_key: "avatar-key",
    public_rankings_opt_in: true,
    plan_code: "ILUMINADO",
    plan_status: "active",
    starts_at: PROFILE_PLAN_START,
    expires_at: PROFILE_PLAN_END,
    remaining_ideas: 7,
    remaining_roasts: 0,
  },
  {
    user_id: USER_ID,
    email: "persona@example.es",
    username: "Persona",
    email_verified_at: PROFILE_CREATED_AT,
    user_created_at: PROFILE_CREATED_AT,
    roast_messages_sent: "12",
    role: "user",
    avatar_key: "avatar-key",
    public_rankings_opt_in: true,
    plan_code: "FALTON",
    plan_status: "inactive",
    starts_at: null,
    expires_at: null,
    remaining_ideas: 0,
    remaining_roasts: 0,
  },
];

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
};

function createTransactionRepository(results: QueryResult[]) {
  const clientQuery = vi.fn();
  for (const result of results) {
    clientQuery.mockResolvedValueOnce(result);
  }
  const release = vi.fn();
  const client = { query: clientQuery, release };
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn(),
  };
  return {
    repository: new PostgresRegistrationRepository(pool as unknown as Pool),
    clientQuery,
    release,
  };
}

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
    expect(userInsert?.[1]).toContain("v5");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns the plan for an available registration intent", async () => {
    query.mockResolvedValueOnce({
      rows: [{ plan_code: "ILUMINADO" }],
      rowCount: 1,
    });

    await expect(repository.currentIntent("intent-hash")).resolves.toBe(
      "ILUMINADO",
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("expires_at > now()"),
      ["intent-hash"],
    );
  });

  it("returns only a session backed by an active account", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    query
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: USER_ID,
            username: "Persona",
            plan_code: "ILUMINADO",
            remember_me: false,
            expires_at: expiresAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(repository.getSessionIdentity(REFRESH_HASH)).resolves.toEqual({
      userId: USER_ID,
      username: "Persona",
      plan: "ILUMINADO",
      rememberMe: false,
      expiresAt,
    });
    expect(query.mock.calls[0]?.[0]).toContain("user_account.status='active'");
    expect(query.mock.calls[0]?.[0]).not.toContain("email_verified_at");
    await expect(
      repository.getSessionIdentity("missing-refresh-hash"),
    ).resolves.toBe(null);
  });

  it("normalizes login identifiers and returns no identity when absent", async () => {
    const loginIdentity = {
      userId: USER_ID,
      username: "Persona",
      passwordHash: "stored-password-hash",
    };
    query
      .mockResolvedValueOnce({ rows: [loginIdentity], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      repository.findLoginIdentity("  PERSONA@EXAMPLE.ES  "),
    ).resolves.toEqual(loginIdentity);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("email_normalized=$1 OR username_normalized=$1"),
      ["persona@example.es"],
    );
    expect(query.mock.calls[0]?.[0]).toContain("status='active'");
    expect(query.mock.calls[0]?.[0]).not.toContain("email_verified_at");
    await expect(
      repository.findLoginIdentity("missing@example.es"),
    ).resolves.toBe(null);
  });

  it("updates a password hash only when the expected hash still matches", async () => {
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      repository.updatePasswordHash(USER_ID, "old-hash", "new-hash"),
    ).resolves.toBe(true);
    await expect(
      repository.updatePasswordHash(USER_ID, "stale-hash", "new-hash"),
    ).resolves.toBe(false);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("WHERE id=$1 AND password_hash=$2"),
      [USER_ID, "old-hash", "new-hash"],
    );
  });

  it("maps a session profile and returns null when the session is unavailable", async () => {
    query
      .mockResolvedValueOnce({
        rows: PROFILE_ROWS,
        rowCount: PROFILE_ROWS.length,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const profile = await repository.getProfile(REFRESH_HASH);
    expect(profile?.user).toMatchObject({
      email: "persona@example.es",
      emailVerified: true,
      roastMessagesSent: 12,
      avatarUrl: "/api/avatars/avatar-key",
    });
    expect(profile?.plans).toHaveLength(2);
    await expect(repository.getProfile("missing-refresh-hash")).resolves.toBe(
      null,
    );
  });

  it("maps a user profile and returns null when the user does not exist", async () => {
    query
      .mockResolvedValueOnce({
        rows: PROFILE_ROWS,
        rowCount: PROFILE_ROWS.length,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(repository.getProfileForUser(USER_ID)).resolves.toMatchObject({
      user: { username: "Persona" },
      plans: [{ plan: "ILUMINADO" }, { plan: "FALTON" }],
    });
    await expect(repository.getProfileForUser("missing-user-id")).resolves.toBe(
      null,
    );
  });

  it("lists only the requested user's saved idea summaries", async () => {
    const createdAt = new Date("2026-10-27T10:00:00.000Z");
    query.mockResolvedValueOnce({
      rows: [{ id: "idea-id", title: "Idea aprobada", created_at: createdAt }],
      rowCount: 1,
    });

    await expect(repository.listGoodIdeas(USER_ID)).resolves.toEqual([
      {
        id: "idea-id",
        title: "Idea aprobada",
        createdAt: createdAt.toISOString(),
      },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2",
      ),
      [USER_ID, 10],
    );
  });

  it("replaces a verification token only when the account is eligible for resend", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    const { repository: resendRepository, clientQuery } =
      createTransactionRepository([
        { rows: [], rowCount: 0 },
        {
          rows: [{ id: "pending-id", email: "persona@example.es" }],
          rowCount: 1,
        },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      ]);

    await expect(
      resendRepository.replaceVerificationToken(
        "persona@example.es",
        "new-token-hash",
        expiresAt,
      ),
    ).resolves.toEqual({ id: "pending-id", email: "persona@example.es" });
    expect(clientQuery.mock.calls[1]?.[0]).toContain(
      "verification_resend_count < 5",
    );
    await expect(
      resendRepository.replaceVerificationToken(
        "persona@example.es",
        "new-token-hash",
        expiresAt,
      ),
    ).resolves.toBe(null);
  });

  it("releases the resend cooldown for an unverified registration", async () => {
    await repository.releaseVerificationResendCooldown("pending-id");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "verification_last_sent_at=now() - interval '60 seconds'",
      ),
      ["pending-id"],
    );
  });

  it("looks up a verified registration owner only while confirmation is pending", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: USER_ID }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      repository.getVerifiedRegistrationUserId(VERIFIED_TOKEN_HASH),
    ).resolves.toBe(USER_ID);
    expect(query.mock.calls[0]?.[0]).toContain("confirmed_at IS NULL");
    await expect(
      repository.getVerifiedRegistrationUserId("unknown-verified-hash"),
    ).resolves.toBe(null);
  });

  it("verifies a pending registration and marks its user email as verified", async () => {
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      {
        rows: [{ plan_code: "FALTON", user_id: USER_ID }],
        rowCount: 1,
      },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);
    const verificationExpiresAt = new Date("2030-01-01T00:00:00.000Z");

    await expect(
      repository.verify(
        "verification-token-hash",
        VERIFIED_TOKEN_HASH,
        verificationExpiresAt,
      ),
    ).resolves.toEqual({ status: "email_verified", plan: "FALTON" });

    expect(clientQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("verified_token_hash=$2"),
      ["verification-token-hash", VERIFIED_TOKEN_HASH, verificationExpiresAt],
    );
    expect(clientQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("status='email_verified'"),
      [USER_ID],
    );
    expect(clientQuery).toHaveBeenNthCalledWith(4, "COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back when verification token is expired, consumed, or unknown", async () => {
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.verify(
        "expired-verification-hash",
        VERIFIED_TOKEN_HASH,
        new Date("2030-01-01T00:00:00.000Z"),
      ),
    ).rejects.toThrow("Verification unavailable.");

    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rotates a live session and returns its current identity", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      {
        rows: [
          {
            id: "session-id",
            user_id: USER_ID,
            username: "Persona",
            plan_code: "ILUMINADO",
            remember_me: true,
            expires_at: expiresAt,
          },
        ],
        rowCount: 1,
      },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.rotateSession(
        REFRESH_HASH,
        NEXT_ACCESS_HASH,
        NEXT_REFRESH_HASH,
      ),
    ).resolves.toEqual({
      userId: USER_ID,
      username: "Persona",
      plan: "ILUMINADO",
      rememberMe: true,
      expiresAt,
    });
    expect(clientQuery.mock.calls[1]?.[0]).toContain("u.status='active'");
    expect(clientQuery.mock.calls[1]?.[0]).not.toContain("email_verified_at");

    expect(clientQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("previous_refresh_token_hash=refresh_token_hash"),
      ["session-id", NEXT_ACCESS_HASH, NEXT_REFRESH_HASH, REFRESH_HASH],
    );
    expect(clientQuery).toHaveBeenNthCalledWith(4, "COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back session rotation when the refresh token is unavailable", async () => {
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.rotateSession(
        REFRESH_HASH,
        NEXT_ACCESS_HASH,
        NEXT_REFRESH_HASH,
      ),
    ).rejects.toThrow("Refresh token unavailable.");

    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("saves a good idea once and treats a matching retry as successful", async () => {
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      { rows: [{ request_hash: "request-hash" }], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.saveGoodIdea(
        USER_ID,
        "Idea aprobada",
        "submission-hash",
        "request-hash",
      ),
    ).resolves.toBe(true);
    expect(clientQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO approved_ideas"),
      [USER_ID, "Idea aprobada", "submission-hash", "request-hash"],
    );
    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("only accepts an existing good idea retry with the same request hash", async () => {
    const { repository: matchingRepository } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [{ request_hash: "request-hash" }], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);
    const { repository: conflictingRepository } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [{ request_hash: "different-request-hash" }], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);
    const submission = [USER_ID, "Idea aprobada", "submission-hash"] as const;

    await expect(
      matchingRepository.saveGoodIdea(...submission, "request-hash"),
    ).resolves.toBe(true);
    await expect(
      conflictingRepository.saveGoodIdea(...submission, "request-hash"),
    ).resolves.toBe(false);
  });

  it("activates the verified account, plan, purchase, and session atomically", async () => {
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      {
        rows: [
          {
            id: "pending-registration-id",
            user_id: USER_ID,
            username: "Persona",
            plan_code: "FALTON",
            confirmed_at: null,
          },
        ],
        rowCount: 1,
      },
      { rows: [{ id: "subscription-id" }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");

    await expect(
      repository.confirm(
        VERIFIED_TOKEN_HASH,
        NEXT_ACCESS_HASH,
        NEXT_REFRESH_HASH,
        expiresAt,
      ),
    ).resolves.toEqual({
      status: "active",
      plan: "FALTON",
      userId: USER_ID,
      username: "Persona",
    });

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO account_daily_plan_usage"),
      [USER_ID],
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO simulated_purchases"),
      [USER_ID, "subscription-id", "pending-registration-id", "FALTON"],
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO auth_sessions"),
      [USER_ID, NEXT_ACCESS_HASH, NEXT_REFRESH_HASH, expiresAt],
    );
    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back confirmation when email verification is missing", async () => {
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.confirm(
        VERIFIED_TOKEN_HASH,
        NEXT_ACCESS_HASH,
        NEXT_REFRESH_HASH,
        new Date("2030-01-01T00:00:00.000Z"),
      ),
    ).rejects.toThrow("Verification required.");

    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back confirmation when the selected plan is unavailable", async () => {
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      {
        rows: [
          {
            id: "pending-registration-id",
            user_id: USER_ID,
            username: "Persona",
            plan_code: "FALTON",
            confirmed_at: null,
          },
        ],
        rowCount: 1,
      },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.confirm(
        VERIFIED_TOKEN_HASH,
        NEXT_ACCESS_HASH,
        NEXT_REFRESH_HASH,
        PROFILE_PLAN_END,
      ),
    ).rejects.toThrow("Selected plan unavailable.");
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("creates a simulated plan purchase and maps the refreshed account profile", async () => {
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      { rows: [{ id: USER_ID }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: "subscription-id" }], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: PROFILE_ROWS, rowCount: PROFILE_ROWS.length },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.createSubscriptionPurchase(
        USER_ID,
        "ILUMINADO",
        "purchase-key",
      ),
    ).resolves.toEqual({
      user: {
        email: "persona@example.es",
        username: "Persona",
        role: "user",
        emailVerified: true,
        createdAt: PROFILE_CREATED_AT.toISOString(),
        roastMessagesSent: 12,
        publicRankingsOptIn: true,
        avatarUrl: "/api/avatars/avatar-key",
      },
      plans: [
        {
          plan: "ILUMINADO",
          status: "active",
          startsAt: PROFILE_PLAN_START.toISOString(),
          expiresAt: PROFILE_PLAN_END.toISOString(),
          attemptsRemaining: { ideas: 7, roasts: 0 },
        },
        {
          plan: "FALTON",
          status: "inactive",
          startsAt: null,
          expiresAt: null,
          attemptsRemaining: { ideas: 0, roasts: 0 },
        },
      ],
    });

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO subscriptions"),
      [USER_ID, "ILUMINADO", "purchase-key"],
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO simulated_purchases"),
      [USER_ID, "subscription-id", "purchase-key", "ILUMINADO"],
    );
    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns the existing profile for a retried subscription purchase", async () => {
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      { rows: [{ id: USER_ID }], rowCount: 1 },
      { rows: [{ id: "previous-purchase-id" }], rowCount: 1 },
      { rows: PROFILE_ROWS, rowCount: PROFILE_ROWS.length },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.createSubscriptionPurchase(
        USER_ID,
        "ILUMINADO",
        "purchase-key",
      ),
    ).resolves.not.toBeNull();
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO subscriptions"),
      ),
    ).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects a second active subscription for the same plan", async () => {
    const { repository, clientQuery, release } = createTransactionRepository([
      { rows: [], rowCount: 0 },
      { rows: [{ id: USER_ID }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: "active-subscription-id" }], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.createSubscriptionPurchase(
        USER_ID,
        "ILUMINADO",
        "purchase-key",
      ),
    ).rejects.toThrow("PLAN_ALREADY_ACTIVE");
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("closes the repository connection pool", async () => {
    await repository.close();

    expect(end).toHaveBeenCalledOnce();
  });
});
