import { Injectable, OnModuleInit } from "@nestjs/common";
import type { Pool } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { hashPassword } from "../infrastructure/auth/password-hasher";

const ADMIN_USERNAME = "jappy";
const ADMIN_EMAIL = "jappy@grumphya.invalid";
const ADMIN_POLICY_VERSION = "admin-bootstrap-v1";
const ADMIN_PASSWORD_MIN_LENGTH = 12;
const ADMIN_PASSWORD_MAX_LENGTH = 128;
const UPPERCASE_PATTERN = /\p{Lu}/u;
const LOWERCASE_PATTERN = /\p{Ll}/u;
const NUMBER_PATTERN = /\p{N}/u;
const SPECIAL_PATTERN = /[^\p{L}\p{N}\s]/u;

@Injectable()
export class AdminAccountBootstrap implements OnModuleInit {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    const password = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    if (!isValidAdminPassword(password)) {
      throw new Error(
        "ADMIN_PASSWORD must be configured with a strong password.",
      );
    }
    await runMigrations(this.pool);
    await upsertAdminAccount(this.pool, await hashPassword(password));
  }
}

export async function upsertAdminAccount(
  pool: Pick<Pool, "connect">,
  passwordHash: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(728194032)");
    const existing = await client.query<{ id: string; role: string }>(
      `SELECT id,role FROM users WHERE username_normalized=$1 FOR UPDATE`,
      [ADMIN_USERNAME],
    );
    const account = existing.rows[0];
    if (account && account.role !== "admin") {
      throw new Error("Reserved admin username is already in use.");
    }
    if (account) {
      await client.query(
        `UPDATE users SET password_hash=$2,status='active',email_verified_at=COALESCE(email_verified_at,now())
         WHERE id=$1`,
        [account.id, passwordHash],
      );
      await client.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [account.id],
      );
    } else {
      await client.query(
        `INSERT INTO users(email,email_normalized,username,username_normalized,password_hash,
          privacy_policy_version,privacy_policy_acknowledged_at,email_verified_at,status,role)
         VALUES($1,$2,$3,$4,$5,$6,now(),now(),'active','admin')`,
        [
          ADMIN_EMAIL,
          ADMIN_EMAIL,
          ADMIN_USERNAME,
          ADMIN_USERNAME,
          passwordHash,
          ADMIN_POLICY_VERSION,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function isValidAdminPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= ADMIN_PASSWORD_MIN_LENGTH &&
    value.length <= ADMIN_PASSWORD_MAX_LENGTH &&
    UPPERCASE_PATTERN.test(value) &&
    LOWERCASE_PATTERN.test(value) &&
    NUMBER_PATTERN.test(value) &&
    SPECIAL_PATTERN.test(value)
  );
}
