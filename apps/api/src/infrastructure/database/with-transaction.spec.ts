import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { withTransaction } from "./with-transaction";

function createPool() {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const client = { query, release: vi.fn() };
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
  return { pool, client, query };
}

describe("withTransaction", () => {
  it("commits a successful operation and releases the client", async () => {
    const { pool, client, query } = createPool();
    const result = await withTransaction(pool, async () => "done");

    expect(result).toBe("done");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back a failed operation and rethrows its error", async () => {
    const { pool, client, query } = createPool();
    const failure = new Error("operation failed");

    await expect(
      withTransaction(pool, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
