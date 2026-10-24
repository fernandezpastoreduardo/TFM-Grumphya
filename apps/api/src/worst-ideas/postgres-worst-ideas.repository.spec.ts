import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { PostgresWorstIdeasRepository } from "./postgres-worst-ideas.repository";

const VALID_EMBEDDING = Array.from({ length: 1536 }, () => 0.25);
const SAFE_TITLE = "La red social de las tostadoras";
const REJECTION_SCORE = 2.4;
const IDEMPOTENCY_HASH = "sha256:anonymized-hash";
const REQUEST_HASH = "hmac:anonymized-request-hash";
const IDEA_ID = "5d5e03ab-753d-4fa0-b5ec-f1d55abe4382";

interface CapturedQuery {
  sql: string;
  values?: unknown[];
}

class FakePgClient {
  readonly queries: CapturedQuery[] = [];
  releaseCalled = false;
  duplicateHash = false;
  currentCount = 4;
  returnNoUpdate = false;
  continuationClaimed = false;
  idempotencyExists = true;
  submissionType: "match" | "new_rejection" = "match";
  continuationExpired = false;
  continuationRequestHash = REQUEST_HASH;

  async query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>> {
    this.queries.push({ sql, values });
    if (sql.includes("INSERT INTO rejected_idea_idempotency")) {
      return this.result(
        this.duplicateHash ? [] : [{ idempotency_hash: IDEMPOTENCY_HASH }],
      ) as unknown as QueryResult<Row>;
    }
    if (
      sql.includes("SELECT rejected_idea_id FROM rejected_idea_idempotency")
    ) {
      return this.result([
        { rejected_idea_id: IDEA_ID },
      ]) as unknown as QueryResult<Row>;
    }
    if (sql.includes("JOIN rejected_ideas AS ideas")) {
      return this.result([
        { id: IDEA_ID, safe_title: SAFE_TITLE, count: this.currentCount },
      ]) as unknown as QueryResult<Row>;
    }
    if (sql.includes("INSERT INTO rejected_ideas")) {
      return this.result([{ id: IDEA_ID }]) as unknown as QueryResult<Row>;
    }
    if (sql.includes("UPDATE rejected_idea_idempotency")) {
      if (sql.includes("continue_started_at")) {
        if (sql.includes("SET continue_started_at = NULL")) {
          const [idempotencyHash, requestHash] = values ?? [];
          const canRelease =
            this.continuationClaimed &&
            this.idempotencyExists &&
            this.submissionType === "match" &&
            !this.continuationExpired &&
            idempotencyHash === IDEMPOTENCY_HASH &&
            requestHash === this.continuationRequestHash;
          if (canRelease) this.continuationClaimed = false;
          return {
            rows: [],
            rowCount: canRelease ? 1 : 0,
            command: "UPDATE",
            oid: 0,
            fields: [],
          } as unknown as QueryResult<Row>;
        }
        if (
          !this.idempotencyExists ||
          this.continuationClaimed ||
          this.submissionType !== "match"
        ) {
          return {
            rows: [],
            rowCount: 0,
            command: "UPDATE",
            oid: 0,
            fields: [],
          } as unknown as QueryResult<Row>;
        }
        this.continuationClaimed = true;
        return {
          rows: [{ idempotency_hash: IDEMPOTENCY_HASH }] as unknown as Row[],
          rowCount: 1,
          command: "UPDATE",
          oid: 0,
          fields: [],
        };
      }
      return {
        rows: [],
        rowCount: 1,
        command: "UPDATE",
        oid: 0,
        fields: [],
      } as unknown as QueryResult<Row>;
    }
    if (sql.includes("UPDATE rejected_ideas")) {
      if (this.returnNoUpdate)
        return {
          rows: [],
          rowCount: 0,
          command: "UPDATE",
          oid: 0,
          fields: [],
        } as unknown as QueryResult<Row>;
      this.currentCount += 1;
      return {
        rows: [{ count: this.currentCount }] as unknown as Row[],
        rowCount: 1,
        command: "UPDATE",
        oid: 0,
        fields: [],
      };
    }
    return this.result([]) as unknown as QueryResult<Row>;
  }

  release(): void {
    this.releaseCalled = true;
  }

  private result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
    return {
      rows,
      rowCount: rows.length,
      command: "SELECT",
      oid: 0,
      fields: [],
    };
  }
}

class FakePgPool {
  readonly client = new FakePgClient();
  readonly queries: CapturedQuery[] = [];
  rankingRows: Array<{
    safe_title: string;
    rejected_count: string;
  }> = [
    { safe_title: SAFE_TITLE, rejected_count: "7" },
    { safe_title: "Un calendario para no hacer nada", rejected_count: "3" },
  ];
  userHistoryRows: Array<{
    safe_title: string;
    submission_count: string;
  }> = [
    { safe_title: SAFE_TITLE, submission_count: "4" },
    { safe_title: "Un calendario para no hacer nada", submission_count: "2" },
  ];

  async connect(): Promise<PoolClient> {
    return this.client as unknown as PoolClient;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>> {
    this.queries.push({ sql, values });
    if (sql.includes("FROM rejected_idea_weekly_counts")) {
      return {
        rows: this.rankingRows as unknown as Row[],
        rowCount: this.rankingRows.length,
        command: "SELECT",
        oid: 0,
        fields: [],
      };
    }
    if (sql.includes("FROM user_rejected_ideas AS history")) {
      return {
        rows: this.userHistoryRows as unknown as Row[],
        rowCount: this.userHistoryRows.length,
        command: "SELECT",
        oid: 0,
        fields: [],
      };
    }
    return {
      rows: [
        {
          id: IDEA_ID,
          safe_title: SAFE_TITLE,
          count: "4",
          last_received_at: new Date("2026-10-13T10:00:00.000Z"),
          source: "openai",
          version: "text-embedding-3-small",
          dimension: 1536,
          similarity: 0.94,
        },
      ] as unknown as Row[],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    };
  }
}

const makeRepository = (pool: FakePgPool): PostgresWorstIdeasRepository =>
  new PostgresWorstIdeasRepository(
    pool as unknown as Pick<Pool, "query" | "connect">,
    async () => undefined,
  );

describe("PostgresWorstIdeasRepository", () => {
  it("lists only the requested user's safe titles and submission counts", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);
    const userId = "00000000-0000-4000-8000-000000000001";

    await expect(repository.getIdeaListWorstUser(userId)).resolves.toEqual([
      { safeTitle: SAFE_TITLE, count: 4 },
      { safeTitle: "Un calendario para no hacer nada", count: 2 },
    ]);

    expect(pool.queries[0]?.values).toEqual([userId]);
    expect(pool.queries[0]?.sql).toContain("WHERE history.user_id = $1");
    expect(pool.queries[0]?.sql).toContain(
      "ORDER BY history.submission_count DESC, ideas.safe_title ASC",
    );
    expect(pool.queries[0]?.sql).toContain("LIMIT 10");
    expect(pool.queries[0]?.sql).toContain("ideas.safe_title");
    expect(pool.queries[0]?.sql).toContain("history.submission_count");
    expect(pool.queries[0]?.sql).not.toContain("original_idea");
    expect(pool.queries[0]?.sql).not.toContain("idea_text");
  });

  it("prioritizes weekly repetition count over the rubric score", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    await expect(repository.getIdeaListWorstAll()).resolves.toEqual([
      { safeTitle: SAFE_TITLE, weeklyCount: 7 },
      { safeTitle: "Un calendario para no hacer nada", weeklyCount: 3 },
    ]);

    expect(pool.queries[0]?.sql).toContain("Europe/Madrid");
    expect(pool.queries[0]?.sql).toContain(
      "weekly.week_start = date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date",
    );
    expect(pool.queries[0]?.sql).toContain(
      "JOIN rejected_ideas AS ideas ON ideas.id = weekly.rejected_idea_id",
    );
    expect(pool.queries[0]?.sql).toContain("ideas.safe_title");
    expect(pool.queries[0]?.sql).toContain("weekly.rejected_count");
    expect(pool.queries[0]?.sql).toMatch(
      /ORDER BY\s+weekly\.rejected_count DESC,\s+ideas\.safe_title ASC/,
    );
    expect(pool.queries[0]?.sql).toContain("LIMIT 10");
    expect(pool.queries[0]?.sql).not.toContain("rubric_score ASC");
    expect(pool.queries[0]?.sql).not.toContain("idea_text");
    expect(pool.queries[0]?.sql).not.toContain("user_id");
  });

  it("searches by vector distance and returns only safe public fields", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    const matches = await repository.searchRejected(VALID_EMBEDDING, 20);

    expect(matches).toEqual([
      {
        id: IDEA_ID,
        safeTitle: SAFE_TITLE,
        count: 4,
        similarity: 0.94,
        lastReceivedAt: new Date("2026-10-13T10:00:00.000Z"),
        source: "openai",
        version: "text-embedding-3-small",
        dimension: 1536,
      },
    ]);
    expect(pool.queries[0]?.sql).toContain("embedding <=> $1::vector(1536)");
    expect(pool.queries[0]?.sql).toContain(
      "1 - (embedding <=> $1::vector(1536)) AS similarity",
    );
    expect(pool.queries[0]?.sql).not.toContain("< $5");
    expect(pool.queries[0]?.sql).toContain("LIMIT $5");
    expect(pool.queries[0]?.sql).toContain(
      "last_received_at > now() - interval '24 months'",
    );
    expect(pool.queries[0]?.sql).toContain("embedding_source = $3");
    expect(pool.queries[0]?.sql).toContain(
      "embedding_version = ANY($4::text[])",
    );
    expect(pool.queries[0]?.values?.slice(1)).toEqual([
      1536,
      "openai",
      ["text-embedding-3-small-semantic-v1", "text-embedding-3-small"],
      20,
    ]);
  });

  it("inserts only safe title and embedding data atomically and increments the Madrid week", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    await expect(
      repository.addToWorstIdeas(
        SAFE_TITLE,
        REJECTION_SCORE,
        VALID_EMBEDDING,
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ),
    ).resolves.toBe(IDEA_ID);

    const queries = pool.client.queries;
    expect(queries.map(({ sql }) => sql.trim().split(/\s+/)[0])).toEqual([
      "BEGIN",
      "INSERT",
      "INSERT",
      "UPDATE",
      "INSERT",
      "COMMIT",
    ]);
    const insert = queries.find(({ sql }) =>
      sql.includes("INSERT INTO rejected_ideas"),
    );
    expect(insert?.sql).not.toContain("idea_text");
    expect(insert?.values).toEqual([
      SAFE_TITLE,
      REJECTION_SCORE,
      `[${VALID_EMBEDDING.join(",")}]`,
      "openai",
      "text-embedding-3-small-semantic-v1",
      1536,
    ]);
    expect(
      queries.find(({ sql }) => sql.includes("week_start"))?.sql,
    ).toContain("Europe/Madrid");
    expect(
      queries.find(({ sql }) => sql.includes("rejected_idea_idempotency"))
        ?.values,
    ).toEqual([IDEMPOTENCY_HASH, "new_rejection", REQUEST_HASH]);
    expect(pool.client.releaseCalled).toBe(true);
  });

  it("returns the original idea on an idempotent retry without increasing counts", async () => {
    const pool = new FakePgPool();
    pool.client.duplicateHash = true;
    const repository = makeRepository(pool);

    await expect(
      repository.addToWorstIdeas(
        SAFE_TITLE,
        REJECTION_SCORE,
        VALID_EMBEDDING,
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ),
    ).resolves.toBe(IDEA_ID);

    expect(
      pool.client.queries.map(({ sql }) => sql.trim().split(/\s+/)[0]),
    ).toEqual(["BEGIN", "INSERT", "SELECT", "COMMIT"]);
  });

  it("updates the idea and weekly aggregate once per idempotency hash", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    await expect(
      repository.updateWorstIdea(IDEA_ID, IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toBe(5);

    expect(
      pool.client.queries.some(({ sql }) =>
        sql.includes("SET count = count + 1"),
      ),
    ).toBe(true);
    expect(
      pool.client.queries.some(({ sql }) => sql.includes("week_start")),
    ).toBe(true);
    expect(pool.client.queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("rolls back when the update target does not exist", async () => {
    const pool = new FakePgPool();
    pool.client.returnNoUpdate = true;
    const repository = makeRepository(pool);

    await expect(
      repository.updateWorstIdea(IDEA_ID, IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toThrow("Rejected idea is unavailable.");
    expect(pool.client.queries.at(-1)?.sql).toBe("ROLLBACK");
    expect(pool.client.releaseCalled).toBe(true);
  });

  it("returns the current count for an idempotent match retry without incrementing", async () => {
    const pool = new FakePgPool();
    pool.client.duplicateHash = true;
    pool.client.currentCount = 8;
    const repository = makeRepository(pool);

    await expect(
      repository.updateWorstIdea(IDEA_ID, IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toBe(8);

    expect(
      pool.client.queries.some(({ sql }) =>
        sql.includes("UPDATE rejected_ideas"),
      ),
    ).toBe(false);
    expect(pool.client.queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("reads idempotent matches only when the hash is a live match record", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    await expect(
      repository.getIdempotentMatch(IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toEqual({ id: IDEA_ID, safeTitle: SAFE_TITLE, count: 4 });

    expect(pool.queries[0]?.sql).toContain(
      "requests.submission_type = 'match'",
    );
    expect(pool.queries[0]?.sql).toContain("requests.expires_at > now()");
    expect(pool.queries[0]?.sql).toContain(
      "ideas.last_received_at > now() - interval '24 months'",
    );
  });

  it("limits similarity search to ideas received within the last 24 months", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    await repository.searchRejected(VALID_EMBEDDING, 20);

    expect(pool.queries[0]?.sql).toContain(
      "last_received_at > now() - interval '24 months'",
    );
  });

  it("allows a live match hash to claim continuation only once", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    await expect(
      repository.claimIdempotentContinuation(IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toBe(true);
    await expect(
      repository.claimIdempotentContinuation(IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toBe(false);

    const claims = pool.client.queries.filter(({ sql }) =>
      sql.includes("SET continue_started_at"),
    );
    expect(claims).toHaveLength(2);
    expect(claims[0]?.sql).toContain("requests.submission_type = 'match'");
    expect(claims[0]?.sql).toContain("requests.expires_at > now()");
    expect(claims[0]?.sql).toContain("continue_started_at IS NULL");
  });

  it("releases a failed live continuation claim", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);
    await repository.claimIdempotentContinuation(
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    );

    await expect(
      repository.releaseIdempotentContinuation(IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toBeUndefined();
    await expect(
      repository.claimIdempotentContinuation(IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toBe(true);

    const release = pool.client.queries.find(({ sql }) =>
      sql.includes("SET continue_started_at = NULL"),
    );
    expect(release?.sql).toContain("submission_type = 'match'");
    expect(release?.sql).toContain("request_hash = $2");
    expect(release?.sql).toContain("expires_at > now()");
  });

  it("does not release a continuation claim for a different request hash", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);
    await repository.claimIdempotentContinuation(
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    );

    await expect(
      repository.releaseIdempotentContinuation(
        IDEMPOTENCY_HASH,
        "hmac:different-request-hash",
      ),
    ).resolves.toBeUndefined();
    await expect(
      repository.claimIdempotentContinuation(IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toBe(false);
  });

  it("does not claim continuation for non-match or missing idempotency hashes", async () => {
    const otherTypePool = new FakePgPool();
    otherTypePool.client.submissionType = "new_rejection";
    const otherTypeRepository = makeRepository(otherTypePool);
    await expect(
      otherTypeRepository.claimIdempotentContinuation(
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ),
    ).resolves.toBe(false);

    const missingPool = new FakePgPool();
    missingPool.client.idempotencyExists = false;
    const missingRepository = makeRepository(missingPool);
    await expect(
      missingRepository.claimIdempotentContinuation(
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ),
    ).resolves.toBe(false);
  });

  it("records a new rejection with a distinct idempotency submission type", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    await repository.addToWorstIdeas(
      SAFE_TITLE,
      REJECTION_SCORE,
      VALID_EMBEDDING,
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    );

    const reserve = pool.client.queries.find(({ sql }) =>
      sql.includes("INSERT INTO rejected_idea_idempotency"),
    );
    expect(reserve?.sql).toContain("submission_type");
    expect(reserve?.values).toEqual([
      IDEMPOTENCY_HASH,
      "new_rejection",
      REQUEST_HASH,
    ]);
  });

  it("persists the rubric score with the rejected idea", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    await repository.addToWorstIdeas(
      SAFE_TITLE,
      REJECTION_SCORE,
      VALID_EMBEDDING,
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    );

    const insert = pool.client.queries.find(({ sql }) =>
      sql.includes("INSERT INTO rejected_ideas"),
    );
    expect(insert?.sql).toContain("(safe_title, rubric_score, embedding,");
    expect(insert?.values?.[0]).toBe(SAFE_TITLE);
    expect(insert?.values?.[1]).toBe(REJECTION_SCORE);
  });

  it("rejects invalid embeddings before querying", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    await expect(repository.searchRejected([0.1], 20)).rejects.toThrow(
      "Rejected idea embedding is invalid.",
    );
    expect(pool.queries).toHaveLength(0);
  });

  it("rejects an out-of-range public score before writing", async () => {
    const pool = new FakePgPool();
    const repository = makeRepository(pool);

    await expect(
      repository.addToWorstIdeas(
        SAFE_TITLE,
        10.1,
        VALID_EMBEDDING,
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ),
    ).rejects.toThrow("Rejected idea input is invalid.");
    expect(pool.client.queries).toHaveLength(0);
  });
});
