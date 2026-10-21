import { describe, expect, it, vi } from "vitest";
import { provisionAdminAccount } from "./admin-account-bootstrap";

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
    queries,
  };
}

describe("explicit administrator provisioning", () => {
  it("fails closed when the reserved alias belongs to a normal user", async () => {
    const fake = poolWithReservedAccount("user");
    await expect(
      provisionAdminAccount(fake.pool, "password-hash"),
    ).rejects.toThrow("Reserved admin username is already in use.");
    expect(fake.queries.some(({ sql }) => sql.includes("COMMIT"))).toBe(false);
    expect(fake.queries.some(({ sql }) => sql.includes("ROLLBACK"))).toBe(true);
  });

  it("does not change the administrator password or sessions on repeat provisioning", async () => {
    const fake = poolWithReservedAccount("admin");
    await expect(provisionAdminAccount(fake.pool, "new-hash")).resolves.toBe(
      "unchanged",
    );
    expect(
      fake.queries.some(({ sql }) =>
        sql.includes("UPDATE users SET password_hash"),
      ),
    ).toBe(false);
    expect(
      fake.queries.some(({ sql }) => sql.includes("UPDATE auth_sessions")),
    ).toBe(false);
    expect(fake.queries.some(({ sql }) => sql.includes("COMMIT"))).toBe(true);
  });

  it("changes the password and revokes sessions only for an explicit rotation", async () => {
    const fake = poolWithReservedAccount("admin");
    await expect(
      provisionAdminAccount(fake.pool, "new-hash", true),
    ).resolves.toBe("password-changed");
    expect(
      fake.queries.find(({ sql }) =>
        sql.includes("UPDATE users SET password_hash"),
      )?.values,
    ).toEqual(["admin-id", "new-hash"]);
    expect(
      fake.queries.some(({ sql }) => sql.includes("UPDATE auth_sessions")),
    ).toBe(true);
  });

  it("creates the reserved administrator with a password hash", async () => {
    const fake = poolWithReservedAccount(null);
    await expect(
      provisionAdminAccount(fake.pool, "opaque-password-hash"),
    ).resolves.toBe("created");
    const insert = fake.queries.find(({ sql }) =>
      sql.includes("INSERT INTO users"),
    );
    expect(insert?.sql).toContain("'admin'");
    expect(insert?.values).toContain("jappy");
    expect(insert?.values).toContain("opaque-password-hash");
  });
});
