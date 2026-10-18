import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresRoastRankingRepository } from "./postgres-roast-ranking.repository";

describe("PostgresRoastRankingRepository", () => {
  it("returns only usernames and counts, ordered descending and capped at ten", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { username: "GrumpyWinner", roast_messages_sent: "30" },
          { username: "TeaSpiller", roast_messages_sent: "21" },
        ],
      }),
    } as unknown as Pool;
    const repository = new PostgresRoastRankingRepository(
      pool,
      vi.fn().mockResolvedValue(undefined),
    );

    await expect(repository.getRoastRanking()).resolves.toEqual([
      { username: "GrumpyWinner", roastMessagesSent: 30 },
      { username: "TeaSpiller", roastMessagesSent: 21 },
    ]);

    const [sql] = vi.mocked(pool.query).mock.calls[0] ?? [];
    expect(String(sql)).toContain("ORDER BY roast_messages_sent DESC");
    expect(String(sql)).toContain("LIMIT 10");
    expect(String(sql)).toContain("status = 'active'");
    expect(String(sql)).not.toContain("email");
    expect(String(sql)).not.toContain("user_id");
  });
});
