import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresBestUsersRepository } from "./postgres-best-users.repository";

describe("PostgresBestUsersRepository", () => {
  it("ranks active users by distinct approved ideas and returns public fields only", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { username: "laura_critica", approved_ideas_count: "18" },
          { username: "pablo_sin_pitch", approved_ideas_count: "13" },
        ],
      }),
    } as unknown as Pool;
    const repository = new PostgresBestUsersRepository(
      pool,
      vi.fn().mockResolvedValue(undefined),
    );

    await expect(repository.getBestListBestUsers()).resolves.toEqual([
      { username: "laura_critica", approvedIdeasCount: 18 },
      { username: "pablo_sin_pitch", approvedIdeasCount: 13 },
    ]);

    const [sql] = vi.mocked(pool.query).mock.calls[0] ?? [];
    expect(String(sql)).toContain("COUNT(DISTINCT approved.id)");
    expect(String(sql)).toContain("status = 'active'");
    expect(String(sql)).toContain("ORDER BY approved_ideas_count DESC");
    expect(String(sql)).toContain("LIMIT 10");
    expect(String(sql)).not.toContain("approved.title");
    expect(String(sql)).not.toContain("email");
    expect(String(sql)).not.toContain("user_id AS");
  });
});
