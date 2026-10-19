import { Pool } from "pg";

const TEST_DATABASE_URL_ENV = "TEST_DATABASE_URL";
const VECTOR_EXTENSION_NAME = "vector";

async function prepareTestDatabase(): Promise<void> {
  const connectionString = process.env[TEST_DATABASE_URL_ENV];
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL must be configured for database tests.");
  }
  const pool = new Pool({ connectionString });
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    const extension = await pool.query<{ name: string }>(
      "SELECT extname AS name FROM pg_extension WHERE extname = $1",
      [VECTOR_EXTENSION_NAME],
    );
    if (extension.rows[0]?.name !== VECTOR_EXTENSION_NAME) {
      throw new Error("The PostgreSQL test database has no vector extension.");
    }
  } finally {
    await pool.end();
  }
}

void prepareTestDatabase().catch(() => {
  process.stderr.write("POSTGRES_TEST_SETUP_FAILED\n");
  process.exitCode = 1;
});
