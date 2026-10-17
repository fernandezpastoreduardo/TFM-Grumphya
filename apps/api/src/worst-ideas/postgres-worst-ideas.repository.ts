import { Pool, type PoolClient } from "pg";
import { runMigrations } from "../infrastructure/database/run-migrations";
import type {
  IdeaListItemWorstAll,
  IdempotentRejectedIdeaMatch,
  RejectedIdeaMatch,
  RejectedIdeaSubmissionType,
  WorstIdeasRepository,
} from "./worst-ideas.models";

const EMBEDDING_DIMENSION = 1536;
const MAX_SEARCH_CANDIDATES = 20;
const IDEMPOTENCY_TTL_HOURS = 24;
const MADRID_TIME_ZONE = "Europe/Madrid";
const VECTOR_SOURCE = "openai";
const VECTOR_VERSION = "text-embedding-3-small-semantic-v1";
const COMPATIBLE_VECTOR_VERSIONS = [
  VECTOR_VERSION,
  "text-embedding-3-small",
] as const;
const SQL_VECTOR_CAST = "::vector(1536)";

interface RejectedIdeaRow {
  id: string;
  safe_title: string;
  count: number;
  similarity: number;
  last_received_at: Date;
  source: string;
  version: string;
  dimension: number;
}

interface WorstIdeaRankingRow {
  safe_title: string;
  rejected_count: number | string;
}

export class PostgresWorstIdeasRepository implements WorstIdeasRepository {
  private ready?: Promise<void>;

  constructor(
    private readonly pool: Pick<Pool, "query" | "connect">,
    private readonly migrationRunner: (
      pool: Pool,
    ) => Promise<void> = runMigrations,
  ) {}

  async getIdeaListWorstAll(): Promise<IdeaListItemWorstAll[]> {
    await this.ensureSchema();
    const result = await this.pool.query<WorstIdeaRankingRow>(
      `SELECT ideas.safe_title, weekly.rejected_count
       FROM rejected_idea_weekly_counts AS weekly
       JOIN rejected_ideas AS ideas ON ideas.id = weekly.rejected_idea_id
       WHERE weekly.week_start = date_trunc('week', now() AT TIME ZONE '${MADRID_TIME_ZONE}')::date
       ORDER BY ideas.rubric_score ASC NULLS LAST,
                weekly.rejected_count DESC,
                ideas.safe_title ASC`,
    );
    return result.rows.map((row) => ({
      safeTitle: row.safe_title,
      weeklyCount: Number(row.rejected_count),
    }));
  }

  async searchRejected(
    embedding: readonly number[],
    limit: number,
  ): Promise<RejectedIdeaMatch[]> {
    await this.ensureSchema();
    this.validateEmbedding(embedding);
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_SEARCH_CANDIDATES
    ) {
      throw new Error("Rejected idea search limit is invalid.");
    }
    const result = await this.pool.query<RejectedIdeaRow>(
      `SELECT id, safe_title, count, last_received_at, embedding_source AS source,
              embedding_version AS version, embedding_dimension AS dimension,
              1 - (embedding <=> $1${SQL_VECTOR_CAST}) AS similarity
       FROM rejected_ideas
       WHERE embedding_dimension = $2
         AND embedding_source = $3
         AND embedding_version = ANY($4::text[])
         AND last_received_at > now() - interval '24 months'
       ORDER BY embedding <=> $1${SQL_VECTOR_CAST}
       LIMIT $5`,
      [
        this.serializeEmbedding(embedding),
        EMBEDDING_DIMENSION,
        VECTOR_SOURCE,
        COMPATIBLE_VECTOR_VERSIONS,
        limit,
      ],
    );
    return result.rows.map((row) => this.toMatch(row));
  }

  async addToWorstIdeas(
    safeTitle: string,
    score: number,
    embedding: readonly number[],
    idempotencyHash: string,
    requestHash: string,
  ): Promise<string> {
    await this.ensureSchema();
    this.validateInput(
      safeTitle,
      score,
      embedding,
      idempotencyHash,
      requestHash,
    );
    return this.transaction(async (client) => {
      const reserved = await this.reserveIdempotency(
        client,
        idempotencyHash,
        "new_rejection",
        requestHash,
      );
      if (!reserved)
        return this.findIdempotentIdea(client, idempotencyHash, requestHash);

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO rejected_ideas
           (safe_title, rubric_score, embedding, count, last_received_at, embedding_source, embedding_version, embedding_dimension)
         VALUES ($1, $2, $3${SQL_VECTOR_CAST}, 1, now(), $4, $5, $6)
         RETURNING id`,
        [
          safeTitle,
          score,
          this.serializeEmbedding(embedding),
          VECTOR_SOURCE,
          VECTOR_VERSION,
          EMBEDDING_DIMENSION,
        ],
      );
      const ideaId = inserted.rows[0]?.id;
      if (!ideaId)
        throw new Error("Rejected idea insert returned no identifier.");
      await this.attachIdempotency(client, idempotencyHash, ideaId);
      await this.incrementWeeklyAggregate(client, ideaId);
      return ideaId;
    });
  }

  async getIdempotentMatch(
    idempotencyHash: string,
    requestHash: string,
  ): Promise<IdempotentRejectedIdeaMatch | null> {
    await this.ensureSchema();
    if (!idempotencyHash.trim())
      throw new Error("Rejected idea idempotency hash is invalid.");
    const result = await this.pool.query<{
      id: string;
      safe_title: string;
      count: number;
    }>(
      `SELECT ideas.id, ideas.safe_title, ideas.count
       FROM rejected_idea_idempotency AS requests
       JOIN rejected_ideas AS ideas ON ideas.id = requests.rejected_idea_id
       WHERE requests.idempotency_hash = $1
         AND requests.submission_type = 'match'
         AND requests.request_hash = $2
         AND requests.expires_at > now()
         AND ideas.last_received_at > now() - interval '24 months'`,
      [idempotencyHash, requestHash],
    );
    const row = result.rows[0];
    return row
      ? { id: row.id, safeTitle: row.safe_title, count: Number(row.count) }
      : null;
  }

  async hasDifferentIdempotentRequest(
    idempotencyHash: string,
    requestHash: string,
  ): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT 1 FROM rejected_idea_idempotency
       WHERE idempotency_hash = $1 AND request_hash IS NOT NULL
         AND request_hash <> $2 AND expires_at > now()
       LIMIT 1`,
      [idempotencyHash, requestHash],
    );
    return result.rowCount === 1;
  }

  async claimIdempotentContinuation(
    idempotencyHash: string,
    requestHash: string,
  ): Promise<boolean> {
    await this.ensureSchema();
    if (!idempotencyHash.trim())
      throw new Error("Rejected idea idempotency hash is invalid.");
    return this.transaction(async (client) => {
      const result = await client.query(
        `UPDATE rejected_idea_idempotency AS requests
         SET continue_started_at = now()
         FROM rejected_ideas AS ideas
         WHERE requests.idempotency_hash = $1
           AND requests.rejected_idea_id = ideas.id
           AND requests.submission_type = 'match'
           AND requests.request_hash = $2
           AND requests.expires_at > now()
           AND requests.continue_started_at IS NULL
           AND ideas.last_received_at > now() - interval '24 months'
         RETURNING requests.idempotency_hash`,
        [idempotencyHash, requestHash],
      );
      return result.rowCount === 1;
    });
  }

  async updateWorstIdea(
    ideaId: string,
    idempotencyHash: string,
    requestHash: string,
  ): Promise<number> {
    await this.ensureSchema();
    if (!ideaId || !idempotencyHash)
      throw new Error("Rejected idea update input is invalid.");
    return this.transaction(async (client) => {
      const reserved = await this.reserveIdempotency(
        client,
        idempotencyHash,
        "match",
        requestHash,
      );
      if (!reserved)
        return this.findIdempotentCount(
          client,
          idempotencyHash,
          "match",
          requestHash,
        );
      const updated = await client.query<{ count: string | number }>(
        `UPDATE rejected_ideas
         SET count = count + 1, last_received_at = now()
         WHERE id = $1 AND last_received_at > now() - interval '24 months'
         RETURNING count`,
        [ideaId],
      );
      if (updated.rowCount !== 1)
        throw new Error("Rejected idea is unavailable.");
      await this.attachIdempotency(client, idempotencyHash, ideaId);
      await this.incrementWeeklyAggregate(client, ideaId);
      return Number(updated.rows[0]!.count);
    });
  }

  private async reserveIdempotency(
    client: PoolClient,
    idempotencyHash: string,
    submissionType: RejectedIdeaSubmissionType,
    requestHash: string,
  ): Promise<boolean> {
    const result = await client.query(
      `INSERT INTO rejected_idea_idempotency (idempotency_hash, submission_type, request_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '${IDEMPOTENCY_TTL_HOURS} hours')
       ON CONFLICT (idempotency_hash) DO UPDATE SET submission_type = EXCLUDED.submission_type,
                                                    request_hash = EXCLUDED.request_hash,
                                                    expires_at = EXCLUDED.expires_at,
                                                    rejected_idea_id = NULL
       WHERE rejected_idea_idempotency.expires_at <= now()
       RETURNING idempotency_hash`,
      [idempotencyHash, submissionType, requestHash],
    );
    return result.rowCount === 1;
  }

  private async findIdempotentCount(
    client: PoolClient,
    idempotencyHash: string,
    submissionType: RejectedIdeaSubmissionType,
    requestHash: string,
  ): Promise<number> {
    const result = await client.query<{ count: number | string }>(
      `SELECT ideas.count
       FROM rejected_idea_idempotency AS requests
       JOIN rejected_ideas AS ideas ON ideas.id = requests.rejected_idea_id
       WHERE requests.idempotency_hash = $1 AND requests.submission_type = $2
         AND requests.request_hash = $3
         AND requests.expires_at > now()
         AND ideas.last_received_at > now() - interval '24 months'`,
      [idempotencyHash, submissionType, requestHash],
    );
    const count = result.rows[0]?.count;
    if (count === undefined)
      throw new Error(
        "Idempotency record is still being processed or has another submission type.",
      );
    return Number(count);
  }

  private async attachIdempotency(
    client: PoolClient,
    idempotencyHash: string,
    ideaId: string,
  ): Promise<void> {
    const result = await client.query(
      "UPDATE rejected_idea_idempotency SET rejected_idea_id = $2 WHERE idempotency_hash = $1",
      [idempotencyHash, ideaId],
    );
    if (result.rowCount !== 1)
      throw new Error("Rejected idea idempotency record is unavailable.");
  }

  private async findIdempotentIdea(
    client: PoolClient,
    idempotencyHash: string,
    requestHash: string,
  ): Promise<string> {
    const result = await client.query<{ rejected_idea_id: string }>(
      `SELECT rejected_idea_id FROM rejected_idea_idempotency
       WHERE idempotency_hash = $1 AND submission_type = 'new_rejection' AND request_hash = $2 AND expires_at > now()`,
      [idempotencyHash, requestHash],
    );
    const ideaId = result.rows[0]?.rejected_idea_id;
    if (!ideaId)
      throw new Error("Idempotency record is still being processed.");
    return ideaId;
  }

  private async incrementWeeklyAggregate(
    client: PoolClient,
    ideaId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO rejected_idea_weekly_counts (rejected_idea_id, week_start, rejected_count)
       VALUES ($1,
         date_trunc('week', now() AT TIME ZONE '${MADRID_TIME_ZONE}')::date,
         1)
       ON CONFLICT (rejected_idea_id, week_start)
       DO UPDATE SET rejected_count = rejected_idea_weekly_counts.rejected_count + 1`,
      [ideaId],
    );
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= this.migrationRunner(this.pool as Pool);
    await this.ready;
  }

  private validateEmbedding(embedding: readonly number[]): void {
    if (
      embedding.length !== EMBEDDING_DIMENSION ||
      embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error("Rejected idea embedding is invalid.");
    }
  }

  private validateInput(
    safeTitle: string,
    score: number,
    embedding: readonly number[],
    idempotencyHash: string,
    requestHash: string,
  ): void {
    this.validateEmbedding(embedding);
    if (
      !safeTitle.trim() ||
      safeTitle.length > 160 ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 10 ||
      !idempotencyHash.trim() ||
      !requestHash.trim()
    ) {
      throw new Error("Rejected idea input is invalid.");
    }
  }

  private serializeEmbedding(embedding: readonly number[]): string {
    return `[${embedding.join(",")}]`;
  }

  private toMatch(row: RejectedIdeaRow): RejectedIdeaMatch {
    return {
      id: row.id,
      safeTitle: row.safe_title,
      count: Number(row.count),
      similarity: Number(row.similarity),
      lastReceivedAt: row.last_received_at,
      source: row.source,
      version: row.version,
      dimension: Number(row.dimension),
    };
  }
}
