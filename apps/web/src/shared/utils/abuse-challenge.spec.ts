import { describe, expect, it } from "vitest";
import { isAbuseChallenge, solveAbuseChallenge } from "./abuse-challenge";

const VALID_CHALLENGE = { token: "signed-challenge", difficulty: 4 };
const INVALID_TOKEN = "invalid-challenge";

describe("abuse challenge", () => {
  it("accepts only bounded, supported challenge parameters", () => {
    expect(isAbuseChallenge(VALID_CHALLENGE)).toBe(true);
    expect(isAbuseChallenge({ token: "", difficulty: 4 })).toBe(false);
    expect(isAbuseChallenge({ token: INVALID_TOKEN, difficulty: 3 })).toBe(
      false,
    );
    expect(isAbuseChallenge({ token: INVALID_TOKEN, difficulty: 28 })).toBe(
      false,
    );
    expect(isAbuseChallenge(null)).toBe(false);
  });

  it("finds a proof whose SHA-256 digest meets the requested difficulty", async () => {
    const proof = await solveAbuseChallenge(VALID_CHALLENGE);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${VALID_CHALLENGE.token}:${proof}`),
    );
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    expect(hex.startsWith("0")).toBe(true);
  });
});
