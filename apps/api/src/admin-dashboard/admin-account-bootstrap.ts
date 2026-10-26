import type { Pool } from "pg";
import { ADMIN_RESERVED_USERNAME } from "../infrastructure/auth/reserved-usernames";

const ADMIN_USERNAME = ADMIN_RESERVED_USERNAME;
const ADMIN_EMAIL = "jappy@grumphya.invalid";
const ADMIN_POLICY_VERSION = "admin-bootstrap-v1";

export async function provisionAdminAccount(
  pool: Pick<Pool, "connect">,
  passwordHash: string,
  changePassword = false,
): Promise<"created" | "unchanged" | "password-changed"> {
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

    let result: "created" | "unchanged" | "password-changed";
    if (!account) {
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
      result = "created";
    } else if (changePassword) {
      await client.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
        account.id,
        passwordHash,
      ]);
      await client.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [account.id],
      );
      result = "password-changed";
    } else {
      result = "unchanged";
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
