import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresWorstIdeasRepository } from "./postgres-worst-ideas.repository";

const DATABASE_URL = process.env.WORST_IDEAS_RANKING_TEST_DATABASE_URL;
const TEST_SCHEMA_PREFIX = "worst_ideas_ranking_test_";
const EMBEDDING = `[${Array.from({ length: 1536 }, () => 0).join(",")}]`;
const LESS_REPEATED_TITLE = "La idea nueva que sacó peor puntuación";
const MORE_REPEATED_TITLE = "La idea repetida cinco veces";

describe.skipIf(!DATABASE_URL)("public worst ideas ranking persistence", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let schemaName: string;
  let repository: PostgresWorstIdeasRepository;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: DATABASE_URL });
    schemaName = `${TEST_SCHEMA_PREFIX}${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
    });
    await runMigrations(testPool);
    repository = new PostgresWorstIdeasRepository(testPool);
  });

  afterAll(async () => {
    await testPool?.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("ranks weekly repetitions before the rubric score", async () => {
    const lessRepeated = await insertRejectedIdea(
      testPool,
      LESS_REPEATED_TITLE,
      1.1,
    );
    const moreRepeated = await insertRejectedIdea(
      testPool,
      MORE_REPEATED_TITLE,
      8.7,
    );
    await testPool.query(
      `INSERT INTO rejected_idea_weekly_counts (rejected_idea_id, week_start, rejected_count)
       VALUES
         ($1, date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date, 1),
         ($2, date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date, 5)`,
      [lessRepeated, moreRepeated],
    );

    await expect(repository.getIdeaListWorstAll()).resolves.toEqual([
      { safeTitle: MORE_REPEATED_TITLE, weeklyCount: 5 },
      { safeTitle: LESS_REPEATED_TITLE, weeklyCount: 1 },
    ]);
  });
});

async function insertRejectedIdea(
  pool: Pool,
  title: string,
  rubricScore: number,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO rejected_ideas (
       safe_title, rubric_score, embedding, embedding_source,
       embedding_version, embedding_dimension
     ) VALUES ($1, $2, $3::vector(1536), 'test', 'test', 1536)
     RETURNING id`,
    [title, rubricScore, EMBEDDING],
  );
  const ideaId = result.rows[0]?.id;
  if (!ideaId) throw new Error("Test rejected idea insert returned no id.");
  return ideaId;
}
