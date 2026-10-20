import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresContactMessageRepository } from "./postgres-contact-message.repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_KEY = "10000000-0000-4000-8000-000000000001";

describe("PostgresContactMessageRepository", () => {
  it("persists the authenticated user's message with parameterized values", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "20000000-0000-4000-8000-000000000001",
              subject: "Consulta",
              created_at: new Date("2026-10-20T10:00:00.000Z"),
              confirmation_status: "pending",
              confirmation_attempts: 0,
              email: "persona@example.es",
            },
          ],
        }),
    } as unknown as Pool;
    const repository = new PostgresContactMessageRepository(
      pool,
      vi.fn().mockResolvedValue(undefined),
    );

    await expect(
      repository.createForUser(
        USER_ID,
        REQUEST_KEY,
        "Consulta",
        "Ayuda con mi cuenta.",
      ),
    ).resolves.toMatchObject({
      recipient: "persona@example.es",
      status: "pending",
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO contact_messages"),
      [USER_ID, "Consulta", "Ayuda con mi cuenta.", REQUEST_KEY],
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("JOIN users user_account"),
      [USER_ID, REQUEST_KEY, "Consulta", "Ayuda con mi cuenta."],
    );
  });
});
