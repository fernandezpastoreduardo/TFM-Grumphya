import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AnonymousIpLimitError,
  PostgresAnonymousUsageRepository,
} from "./postgres-anonymous-usage.repository";

const DATABASE_URL = process.env.ANONYMOUS_USAGE_TEST_DATABASE_URL;
const TEST_SCHEMA_PREFIX = "anonymous_usage_test_";
const REQUEST_HASH = "b".repeat(64);

describe.skipIf(!DATABASE_URL)("Postgres anonymous usage persistence", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let repository: PostgresAnonymousUsageRepository;
  let schemaName: string;

  beforeAll(async () => {
    adminPool = new Pool({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 2_000,
    });
    schemaName = `${TEST_SCHEMA_PREFIX}${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
      connectionTimeoutMillis: 2_000,
    });
    repository = new PostgresAnonymousUsageRepository(testPool);
  });

  afterAll(async () => {
    await testPool?.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("keeps independent lifetime counters and returns the committed response idempotently", async () => {
    const tokenHash = "a".repeat(64);
    await repository.initialize(tokenHash, "d".repeat(64));
    const initial = await repository.getUsage(tokenHash);
    expect(initial).toMatchObject({
      ideas: { limit: 3, used: 0, remaining: 3 },
      roasts: { limit: 3, used: 0, remaining: 3 },
    });

    const first = await repository.reserve(
      tokenHash,
      "ideas",
      "1".repeat(64),
      REQUEST_HASH,
    );
    expect(first.state).toBe("reserved");
    await repository.commit(tokenHash, "ideas", "1".repeat(64), REQUEST_HASH, {
      status: "evaluated",
    });
    await expect(
      repository.reserve(tokenHash, "ideas", "1".repeat(64), REQUEST_HASH),
    ).resolves.toMatchObject({
      state: "cached",
      response: { status: "evaluated" },
      usage: { ideas: { used: 1, remaining: 2 } },
    });
    const afterIdea = await repository.getUsage(tokenHash);
    expect(afterIdea?.ideas).toEqual({ limit: 3, used: 1, remaining: 2 });
    expect(afterIdea?.roasts).toEqual({ limit: 3, used: 0, remaining: 3 });
  });

  it("does not overbook the final concurrent use and releases failed work", async () => {
    const tokenHash = "c".repeat(64);
    await repository.initialize(tokenHash, "e".repeat(64));
    for (const key of ["2", "3"]) {
      const idempotencyHash = key.repeat(64);
      await repository.reserve(
        tokenHash,
        "ideas",
        idempotencyHash,
        REQUEST_HASH,
      );
      await repository.commit(
        tokenHash,
        "ideas",
        idempotencyHash,
        REQUEST_HASH,
        { ok: true },
      );
    }

    const outcomes = await Promise.allSettled([
      repository.reserve(tokenHash, "ideas", "4".repeat(64), REQUEST_HASH),
      repository.reserve(tokenHash, "ideas", "5".repeat(64), REQUEST_HASH),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    const failedRequest = outcomes.find(
      (outcome) => outcome.status === "fulfilled",
    );
    if (failedRequest?.status === "fulfilled") {
      const acceptedKey = outcomes[0]?.status === "fulfilled" ? "4" : "5";
      await repository.release(tokenHash, "ideas", acceptedKey.repeat(64));
    }
    expect((await repository.getUsage(tokenHash))?.ideas).toEqual({
      limit: 3,
      used: 2,
      remaining: 1,
    });
  });

  it("limits cookie rotation by temporary IP HMAC activity and returns a retry window", async () => {
    const ipHmac = createHash("sha256").update(randomUUID()).digest("hex");
    for (let index = 0; index < 20; index += 1) {
      const tokenHash = createHash("sha256")
        .update(`profile-${index}`)
        .digest("hex");
      await repository.initialize(tokenHash, ipHmac);
    }
    await expect(
      repository.initialize("f".repeat(64), ipHmac),
    ).rejects.toBeInstanceOf(AnonymousIpLimitError);
  });
});
