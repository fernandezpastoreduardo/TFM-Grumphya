import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresContactMessageRepository } from "./postgres-contact-message.repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_KEY = "10000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "20000000-0000-4000-8000-000000000001";
const CONTACT_ROW = {
  id: MESSAGE_ID,
  subject: "Consulta",
  created_at: new Date("2026-10-20T10:00:00.000Z"),
  confirmation_status: "pending",
  confirmation_attempts: 0,
  email: "persona@example.es",
} as const;

function createRepository(...queryResults: unknown[]) {
  const pool = {
    query: vi.fn(),
  } as unknown as Pool;
  vi.mocked(pool.query).mockImplementation(async () => {
    const next = queryResults.shift();
    return next as Awaited<ReturnType<Pool["query"]>>;
  });
  const migrationRunner = vi.fn().mockResolvedValue(undefined);
  return {
    pool,
    migrationRunner,
    repository: new PostgresContactMessageRepository(pool, migrationRunner),
  };
}

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

  it("reuses the request key only for the original content and returns a conflict otherwise", async () => {
    const { repository } = createRepository(
      { rowCount: 0, rows: [] },
      { rows: [] },
    );

    await expect(
      repository.createForUser(
        USER_ID,
        REQUEST_KEY,
        "Otro asunto",
        "Otro texto",
      ),
    ).rejects.toMatchObject({
      code: "CONTACT_REQUEST_KEY_REUSED",
      status: 409,
    });
  });

  it("maps a saved message and returns null when the user does not own the requested message", async () => {
    const { repository, migrationRunner } = createRepository(
      { rows: [CONTACT_ROW] },
      { rows: [] },
    );

    await expect(
      repository.getForUser(USER_ID, MESSAGE_ID),
    ).resolves.toMatchObject({
      id: MESSAGE_ID,
      createdAt: "2026-10-20T10:00:00.000Z",
      recipient: "persona@example.es",
      status: "pending",
      canRetry: true,
    });
    await expect(
      repository.getForUser(USER_ID, MESSAGE_ID),
    ).resolves.toBeNull();
    expect(migrationRunner).toHaveBeenCalledTimes(1);
  });

  it.each([
    [undefined, "not_found"],
    [{ confirmation_status: "sent", confirmation_attempts: 1 }, "already_sent"],
    [
      { confirmation_status: "previewed", confirmation_attempts: 1 },
      "already_previewed",
    ],
    [
      { confirmation_status: "not_requested", confirmation_attempts: 0 },
      "not_requested",
    ],
    [
      { confirmation_status: "sending", confirmation_attempts: 1 },
      "in_progress",
    ],
    [
      { confirmation_status: "failed", confirmation_attempts: 3 },
      "retry_limit",
    ],
    [
      { confirmation_status: "failed", confirmation_attempts: 1 },
      "in_progress",
    ],
  ] as const)(
    "classifies a confirmation claim from stored status: %s",
    async (row, expected) => {
      const { repository } = createRepository(
        { rowCount: 0, rows: [] },
        { rows: row ? [row] : [] },
      );

      await expect(
        repository.claimConfirmation(USER_ID, MESSAGE_ID),
      ).resolves.toBe(expected);
    },
  );

  it("claims eligible confirmations and increments the bounded attempt counter", async () => {
    const { pool, repository } = createRepository({ rowCount: 1, rows: [] });

    await expect(
      repository.claimConfirmation(USER_ID, MESSAGE_ID),
    ).resolves.toBe("claimed");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("confirmation_attempts=confirmation_attempts+1"),
      [USER_ID, MESSAGE_ID, 3],
    );
  });

  it.each([
    ["markConfirmationSent", "confirmation_status='sent'"],
    ["markConfirmationPreviewed", "confirmation_status='previewed'"],
  ] as const)(
    "updates confirmation status with %s",
    async (method, expectedSql) => {
      const { pool, repository } = createRepository({ rowCount: 1, rows: [] });

      await repository[method](MESSAGE_ID);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining(expectedSql),
        [MESSAGE_ID],
      );
    },
  );

  it.each([
    [{ confirmation_attempts: 2 }, true],
    [{ confirmation_attempts: 3 }, false],
    [undefined, false],
  ] as const)(
    "allows retry only while attempts remain: %s",
    async (row, canRetry) => {
      const { pool, repository } = createRepository({
        rows: row ? [row] : [],
      });

      await expect(repository.markConfirmationFailed(MESSAGE_ID)).resolves.toBe(
        canRetry,
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("MAIL_DELIVERY_FAILED"),
        [MESSAGE_ID],
      );
    },
  );

  it.each([
    ["failed", 3, false],
    ["sent", 0, false],
    ["previewed", 0, false],
    ["not_requested", 0, false],
    ["sending", 1, false],
  ] as const)(
    "does not offer retry for terminal or exhausted state %s",
    async (confirmation_status, confirmation_attempts, canRetry) => {
      const { repository } = createRepository({
        rows: [{ ...CONTACT_ROW, confirmation_status, confirmation_attempts }],
      });

      await expect(
        repository.getForUser(USER_ID, MESSAGE_ID),
      ).resolves.toMatchObject({
        canRetry,
        status: confirmation_status,
      });
    },
  );
});
