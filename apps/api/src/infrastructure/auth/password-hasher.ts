import { compare, hash } from "bcryptjs";
import {
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

const BCRYPT_COST = 12;
const BCRYPT_MAX_VERIFICATION_COST = 16;
const BCRYPT_HASH_PATTERN =
  /^bcrypt-sha256\$(2[aby]\$(\d{2})\$[./A-Za-z0-9]{53})$/u;
const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCRYPT_KEY_BYTES = 64;
const SCRYPT_SALT_HEX_PATTERN = /^[a-f0-9]{32}$/u;
const SCRYPT_HASH_HEX_PATTERN = /^[a-f0-9]{128}$/u;
const DUMMY_BCRYPT_HASH =
  "bcrypt-sha256$2b$12$N2b7Pw3m10mv0Gwhzurm3.EqfOx1qxD53P1Mwr9iBAy3aywnwSyGK";
const DUMMY_SCRYPT_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

function deriveScryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      SCRYPT_KEY_BYTES,
      SCRYPT_OPTIONS,
      (error, key) => {
        if (error) reject(error);
        else resolve(key as Buffer);
      },
    );
  });
}

function prehashPassword(password: string): string {
  return createHash("sha256").update(password, "utf8").digest("hex");
}

function parseBcryptHash(storedHash: string): {
  bcryptHash: string;
  cost: number;
} | null {
  const match = BCRYPT_HASH_PATTERN.exec(storedHash);
  if (!match) return null;
  const cost = Number(match[2]);
  if (cost < 4 || cost > BCRYPT_MAX_VERIFICATION_COST) return null;
  return { bcryptHash: `$${match[1]}`, cost };
}

async function verifyBcryptHash(
  password: string,
  bcryptHash: string,
): Promise<boolean> {
  return compare(prehashPassword(password), bcryptHash);
}

async function verifyScryptHash(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, expectedHex] = parts;
  if (
    !SCRYPT_SALT_HEX_PATTERN.test(saltHex ?? "") ||
    !SCRYPT_HASH_HEX_PATTERN.test(expectedHex ?? "")
  ) {
    return false;
  }
  const actual = await deriveScryptKey(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
}

export async function hashPassword(password: string): Promise<string> {
  const bcryptHash = await hash(prehashPassword(password), BCRYPT_COST);
  return `bcrypt-sha256${bcryptHash}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string | undefined,
): Promise<boolean> {
  const bcryptParts = parseBcryptHash(storedHash ?? "");
  const isScryptHash = storedHash?.startsWith("scrypt$") === true;
  const bcryptMatches = await verifyBcryptHash(
    password,
    bcryptParts?.bcryptHash ?? parseBcryptHash(DUMMY_BCRYPT_HASH)!.bcryptHash,
  );
  const scryptMatches = await verifyScryptHash(
    password,
    isScryptHash ? storedHash : DUMMY_SCRYPT_HASH,
  );
  return Boolean(
    (bcryptParts && bcryptMatches) || (isScryptHash && scryptMatches),
  );
}

export function needsPasswordRehash(storedHash: string): boolean {
  if (storedHash.startsWith("scrypt$")) return true;
  const bcryptParts = parseBcryptHash(storedHash);
  return bcryptParts !== null && bcryptParts.cost < BCRYPT_COST;
}
