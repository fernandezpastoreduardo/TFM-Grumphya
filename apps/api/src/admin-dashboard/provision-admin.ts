import { hashPassword } from "../infrastructure/auth/password-hasher";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { provisionAdminAccount } from "./admin-account-bootstrap";

const ADMIN_PASSWORD_MIN_LENGTH = 12;
const ADMIN_PASSWORD_MAX_LENGTH = 128;
const UPPERCASE_PATTERN = /\p{Lu}/u;
const LOWERCASE_PATTERN = /\p{Ll}/u;
const NUMBER_PATTERN = /\p{N}/u;
const SPECIAL_PATTERN = /[^\p{L}\p{N}\s]/u;

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

async function main(): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  if (!isValidAdminPassword(password)) {
    throw new Error("ADMIN_PASSWORD must meet the documented password policy.");
  }
  const pool = createPostgresPool();
  try {
    const result = await provisionAdminAccount(
      pool,
      await hashPassword(password),
      process.argv.includes("--change-password"),
    );
    console.log(`Administrator provisioning completed: ${result}.`);
  } finally {
    await pool.end();
  }
}

void main().catch(() => {
  console.error(
    "Administrator provisioning failed. Check the account and database state.",
  );
  process.exitCode = 1;
});
