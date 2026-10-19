import { describe, expect, it, vi } from "vitest";
import { upsertAdminAccount } from "./admin-account-bootstrap";

function poolWithReservedAccount(role: string | null) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes("SELECT id,role FROM users")) {
        return {
          rows: role ? [{ id: "admin-id", role }] : [],
          rowCount: role ? 1 : 0,
        };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn(),
  };
  return {
    pool: { connect: vi.fn().mockResolvedValue(client) },
    client,
    queries,
  };
}

describe("admin account bootstrap", () => {
  it("fails closed when the reserved alias belongs to a normal user", async () => {
    const fake = poolWithReservedAccount("user");
    await expect(upsertAdminAccount(fake.pool, "scrypt-hash")).rejects.toThrow(
      "Reserved admin username is already in use.",
    );
    expect(
      fake.queries.some(({ sql }) =>
        sql.includes("UPDATE users SET password_hash"),
      ),
    ).toBe(false);
    expect(fake.queries.some(({ sql }) => sql.includes("COMMIT"))).toBe(false);
    expect(fake.queries.some(({ sql }) => sql.includes("ROLLBACK"))).toBe(true);
  });

  it("rotates the configured secret hash and revokes prior admin sessions", async () => {
    const fake = poolWithReservedAccount("admin");
    await upsertAdminAccount(fake.pool, "new-scrypt-hash");
    expect(
      fake.queries.find(({ sql }) =>
        sql.includes("UPDATE users SET password_hash"),
      )?.values,
    ).toEqual(["admin-id", "new-scrypt-hash"]);
    expect(
      fake.queries.some(({ sql }) =>
        sql.includes("UPDATE auth_sessions SET revoked_at"),
      ),
    ).toBe(true);
    expect(fake.queries.some(({ sql }) => sql.includes("COMMIT"))).toBe(true);
  });

  it("creates the reserved admin identity without persisting a plaintext password", async () => {
    const fake = poolWithReservedAccount(null);
    await upsertAdminAccount(fake.pool, "opaque-scrypt-hash");
    const insert = fake.queries.find(({ sql }) =>
      sql.includes("INSERT INTO users"),
    );
    expect(insert?.sql).toContain("'admin'");
    expect(insert?.values).toContain("jappy");
    expect(insert?.values).toContain("opaque-scrypt-hash");
    expect(insert?.values).not.toContain("ADMIN_PASSWORD");
  });
});
