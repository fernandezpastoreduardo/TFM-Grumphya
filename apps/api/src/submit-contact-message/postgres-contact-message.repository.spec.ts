import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresContactMessageRepository } from "./postgres-contact-message.repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("PostgresContactMessageRepository", () => {
  it("persists the authenticated user's message with parameterized values", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as unknown as Pool;
    const repository = new PostgresContactMessageRepository(
      pool,
      vi.fn().mockResolvedValue(undefined),
    );

    await repository.createForUser(USER_ID, "Consulta", "Ayuda con mi cuenta.");

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO contact_messages"),
      [USER_ID, "Consulta", "Ayuda con mi cuenta."],
    );
  });
});
