import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

const { createPostgresPool, query } = vi.hoisted(() => ({
  createPostgresPool: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../database/postgres-pool", () => ({ createPostgresPool }));

import {
  hashAccessToken,
  PostgresAccessTokenSessionLookup,
} from "./access-token-session.lookup";

const ACCESS_TOKEN_HASH = "hashed-access-token";
const USER_ID = "user-123";

describe("PostgresAccessTokenSessionLookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rowCount: 1, rows: [{ "?column?": 1 }] });
    createPostgresPool.mockReturnValue({ query });
  });

  it("checks session revocation, expiration, active account and ownership", async () => {
    const lookup = new PostgresAccessTokenSessionLookup({
      query,
    } as unknown as Pool);

    await expect(lookup.isActive(ACCESS_TOKEN_HASH, USER_ID)).resolves.toBe(
      true,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("session.revoked_at IS NULL"),
      [ACCESS_TOKEN_HASH, USER_ID],
    );
    expect(query.mock.calls[0]?.[0]).toContain("session.expires_at > now()");
    expect(query.mock.calls[0]?.[0]).toContain("user_account.status='active'");
    expect(query.mock.calls[0]?.[0]).not.toContain("email_verified_at");
    expect(query.mock.calls[0]?.[0]).toContain("session.user_id=$2");
  });

  it("returns false when the session does not match", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const lookup = new PostgresAccessTokenSessionLookup({
      query,
    } as unknown as Pool);

    await expect(lookup.isActive(ACCESS_TOKEN_HASH, USER_ID)).resolves.toBe(
      false,
    );
  });

  it("creates a default PostgreSQL pool when none is injected", () => {
    const lookup = new PostgresAccessTokenSessionLookup();

    expect(lookup).toBeInstanceOf(PostgresAccessTokenSessionLookup);
    expect(createPostgresPool).toHaveBeenCalledOnce();
  });
});

describe("hashAccessToken", () => {
  it("returns a stable SHA-256 hex digest without returning the input token", () => {
    const firstHash = hashAccessToken("test-token");

    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAccessToken("test-token")).toBe(firstHash);
    expect(hashAccessToken("other-token")).not.toBe(firstHash);
  });
});
