const MAX_PROOF_ATTEMPTS = 5_000_000;
const PROOF_YIELD_INTERVAL = 512;
const MIN_DIFFICULTY_BITS = 4;
const MAX_DIFFICULTY_BITS = 24;
const SHA256_ALGORITHM = "SHA-256";

export type LoginChallenge = { token: string; difficulty: number };

export function isLoginChallenge(value: unknown): value is LoginChallenge {
  if (!value || typeof value !== "object") return false;
  const challenge = value as Record<string, unknown>;
  return (
    typeof challenge.token === "string" &&
    challenge.token.length > 0 &&
    challenge.token.length <= 1_024 &&
    typeof challenge.difficulty === "number" &&
    Number.isInteger(challenge.difficulty) &&
    challenge.difficulty >= MIN_DIFFICULTY_BITS &&
    challenge.difficulty <= MAX_DIFFICULTY_BITS &&
    challenge.difficulty % 4 === 0
  );
}

export async function solveLoginChallenge(
  challenge: LoginChallenge,
): Promise<string> {
  const prefix = "0".repeat(challenge.difficulty / 4);
  for (let attempt = 0; attempt < MAX_PROOF_ATTEMPTS; attempt += 1) {
    const proof = String(attempt);
    const digest = await crypto.subtle.digest(
      SHA256_ALGORITHM,
      new TextEncoder().encode(`${challenge.token}:${proof}`),
    );
    if (toHex(digest).startsWith(prefix)) return proof;
    if (attempt > 0 && attempt % PROOF_YIELD_INTERVAL === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
  throw new Error("Login challenge could not be solved.");
}

function toHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
