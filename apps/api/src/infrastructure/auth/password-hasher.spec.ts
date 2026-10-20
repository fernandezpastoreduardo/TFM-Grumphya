import { describe, expect, it } from "vitest";
import {
  hashPassword,
  needsPasswordRehash,
  verifyPassword,
} from "./password-hasher";

const PASSWORD = "Clave de prueba segura 2026!";
const LONG_PASSWORD_PREFIX = "a".repeat(72);
const LEGACY_PASSWORD = "Una clave segura 2026!";
const LEGACY_SCRYPT_HASH =
  "scrypt$00112233445566778899aabbccddeeff$a93fa84b70923122587058ae0f2e8acb917268e2773ae0eaf2cdd764f829395899384239d564fa901a58a30f0ecc37799a4aa764298a348814a22787e22f0bf6";
const INVALID_HASH = "bcrypt-sha256$not-a-bcrypt-hash";

describe("password hashing", () => {
  it("stores new passwords as bcrypt-sha256 and verifies the password", async () => {
    const passwordHash = await hashPassword(PASSWORD);

    expect(passwordHash).toMatch(/^bcrypt-sha256\$2b\$12\$/u);
    await expect(verifyPassword(PASSWORD, passwordHash)).resolves.toBe(true);
  });

  it("rejects an incorrect password for a valid bcrypt hash", async () => {
    const passwordHash = await hashPassword(PASSWORD);

    await expect(
      verifyPassword("Otra clave 2026!", passwordHash),
    ).resolves.toBe(false);
  });

  it("distinguishes passwords that differ after bcrypt's 72-byte input limit", async () => {
    const password = `${LONG_PASSWORD_PREFIX}X1!`;
    const otherPassword = `${LONG_PASSWORD_PREFIX}Y1!`;
    const passwordHash = await hashPassword(password);

    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
    await expect(verifyPassword(otherPassword, passwordHash)).resolves.toBe(
      false,
    );
  });

  it("returns false for malformed hashes without throwing", async () => {
    await expect(verifyPassword(PASSWORD, INVALID_HASH)).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, undefined)).resolves.toBe(false);
  });

  it("continues to verify existing scrypt hashes", async () => {
    await expect(
      verifyPassword(LEGACY_PASSWORD, LEGACY_SCRYPT_HASH),
    ).resolves.toBe(true);
    await expect(
      verifyPassword("Incorrecta 2026!", LEGACY_SCRYPT_HASH),
    ).resolves.toBe(false);
  });

  it("requests rehash for legacy scrypt but not current bcrypt hashes", async () => {
    const passwordHash = await hashPassword(PASSWORD);

    expect(needsPasswordRehash(LEGACY_SCRYPT_HASH)).toBe(true);
    expect(needsPasswordRehash(passwordHash)).toBe(false);
    expect(needsPasswordRehash(INVALID_HASH)).toBe(false);
  });
});
