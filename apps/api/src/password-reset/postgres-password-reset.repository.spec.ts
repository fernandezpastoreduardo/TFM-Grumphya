import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresPasswordResetRepository } from "./postgres-password-reset.repository";

function makeClient(selectRows: Array<{ user_id: string }>) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT reset.user_id"))
      return {
        rows: selectRows.splice(0, 1),
        rowCount: selectRows.length ? 1 : 0,
      };
    return { rows: [], rowCount: 1 };
  });
  return { query, release: vi.fn() };
}

describe("PostgresPasswordResetRepository", () => {
  it("consumes a token once and revokes sessions in the same transaction", async () => {
    const firstClient = makeClient([{ user_id: "user-id" }]);
    const secondClient = makeClient([]);
    const clients = [firstClient, secondClient];
    const pool = {
      connect: vi.fn(async () => clients.shift()!),
      query: vi.fn(),
    } as unknown as Pool;
    const repository = new PostgresPasswordResetRepository(pool);

    const outcomes = await Promise.all([
      repository.consumeToken("token-hash", "password-hash"),
      repository.consumeToken("token-hash", "password-hash"),
    ]);

    expect(outcomes.sort()).toEqual([false, true]);
    const statements = firstClient.query.mock.calls.map(
      ([statement]) => statement,
    );
    expect(statements[0]).toBe("BEGIN");
    expect(
      statements.some((statement) =>
        statement.includes("FOR UPDATE OF reset, user_account"),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes("UPDATE auth_sessions SET revoked_at=now()"),
      ),
    ).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
    expect(firstClient.release).toHaveBeenCalledOnce();
    expect(secondClient.release).toHaveBeenCalledOnce();
  });

  it("only selects active user accounts and applies an atomic cooldown and hourly cap", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ user_id: "user-id", email: "persona@example.com" }],
    });
    const pool = { query } as unknown as Pool;
    const repository = new PostgresPasswordResetRepository(pool);
    await repository.replaceToken(
      "persona@example.com",
      "hashed-token",
      new Date(Date.now() + 20 * 60 * 1000),
    );
    const [statement] = query.mock.calls[0]!;
    expect(statement).toContain("status='active' AND role='user'");
    expect(statement).toContain("username_normalized <> 'jappy'");
    expect(statement).toContain(
      "last_requested_at <= now() - interval '60 seconds'",
    );
    expect(statement).toContain("request_count < 3");
  });
});
