import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AbuseProtection } from "./abuse-protection.service";

const LOGIN_RATE_PER_SECOND = 10;
const SUSTAINED_SECONDS = 3;
const BLOCKED_IP = "192.0.2.50";

describe("AbuseProtection", () => {
  it("activates request challenges per form scope without cross-triggering", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });
    for (let second = 0; second < SUSTAINED_SECONDS; second += 1) {
      for (let request = 0; request < LOGIN_RATE_PER_SECOND; request += 1) {
        protection.recordProtectedRequest(second * 1_000, "registration");
      }
    }

    expect(protection.isChallengeModeActive(2_999, "registration")).toBe(true);
    expect(protection.isChallengeModeActive(2_999, "login")).toBe(false);
    expect(protection.isChallengeModeActive(2_999, "contact")).toBe(false);
  });

  it("uses a keyed pseudonym for in-memory rate-limit buckets", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });
    const addressKey = protection.getPseudonymousAddressKey(BLOCKED_IP);

    expect(addressKey).not.toContain(BLOCKED_IP);
    expect(protection.getPseudonymousAddressKey(BLOCKED_IP)).toBe(addressKey);
    expect(protection.getPseudonymousAddressKey("192.0.2.51")).not.toBe(
      addressKey,
    );
  });

  it("activates challenge mode after 10 login requests per second for 3 consecutive seconds", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });

    for (let second = 0; second < SUSTAINED_SECONDS; second += 1) {
      for (let request = 0; request < LOGIN_RATE_PER_SECOND; request += 1) {
        protection.recordLoginRequest(second * 1_000);
      }
    }

    expect(protection.isChallengeModeActive(2_999)).toBe(true);
  });

  it("does not activate challenge mode when a one-second window is below threshold", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });

    for (let second = 0; second < SUSTAINED_SECONDS; second += 1) {
      const requestCount =
        second === 1 ? LOGIN_RATE_PER_SECOND - 1 : LOGIN_RATE_PER_SECOND;
      for (let request = 0; request < requestCount; request += 1) {
        protection.recordLoginRequest(second * 1_000);
      }
    }

    expect(protection.isChallengeModeActive(2_999)).toBe(false);
  });

  it("requires a valid one-time web challenge while attack mode is active", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });
    activateAttackMode(protection);
    const challenge = protection.createChallenge(BLOCKED_IP, 3_000);
    const proof = findProof(challenge.token, challenge.difficulty);

    expect(
      protection.verifyChallenge(BLOCKED_IP, challenge.token, proof, 3_001),
    ).toBe(true);
    expect(
      protection.verifyChallenge(BLOCKED_IP, challenge.token, proof, 3_002),
    ).toBe(false);
    expect(
      protection.verifyChallenge("192.0.2.51", challenge.token, proof, 3_002),
    ).toBe(false);
  });

  it("rejects a proof after its challenge expires", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });
    activateAttackMode(protection);
    const challenge = protection.createChallenge(BLOCKED_IP, 3_000);
    const proof = findProof(challenge.token, challenge.difficulty);

    expect(
      protection.verifyChallenge(BLOCKED_IP, challenge.token, proof, 63_000),
    ).toBe(false);
  });

  it("binds each challenge to its protected form scope", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });
    activateAttackMode(protection);
    const challenge = protection.createChallenge(
      BLOCKED_IP,
      3_000,
      "registration",
    );
    const proof = findProof(challenge.token, challenge.difficulty);

    expect(
      protection.verifyChallenge(
        BLOCKED_IP,
        challenge.token,
        proof,
        3_001,
        "contact",
      ),
    ).toBe(false);
    expect(
      protection.verifyChallenge(
        BLOCKED_IP,
        challenge.token,
        proof,
        3_002,
        "registration",
      ),
    ).toBe(true);
  });

  it("blocks an IP for 15 minutes after its fourth failed login during attack mode", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });
    activateAttackMode(protection);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      protection.recordLoginFailure(BLOCKED_IP, 3_000 + attempt);
      expect(protection.getBlockedRetryAfter(BLOCKED_IP, 3_000 + attempt)).toBe(
        0,
      );
    }

    protection.recordLoginFailure(BLOCKED_IP, 3_003);
    expect(protection.getBlockedRetryAfter(BLOCKED_IP, 3_003)).toBe(900);
    expect(protection.getBlockedRetryAfter(BLOCKED_IP, 903_004)).toBe(0);
  });

  it("includes failed logins from the detection window when attack mode begins", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      protection.recordLoginFailure(BLOCKED_IP, attempt * 400);
    }
    activateAttackMode(protection);

    expect(protection.getBlockedRetryAfter(BLOCKED_IP, 3_000)).toBe(899);
  });

  it("exposes only aggregate security counters for the trailing 15 minutes", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });
    activateAttackMode(protection);
    const challenge = protection.createChallenge(BLOCKED_IP, 3_000);
    const proof = findProof(challenge.token, challenge.difficulty);
    protection.verifyChallenge(BLOCKED_IP, challenge.token, proof, 3_001);
    protection.verifyChallenge(BLOCKED_IP, challenge.token, proof, 3_002);
    protection.recordLoginFailure(BLOCKED_IP, 3_003);
    protection.recordBlockedLoginRequest(3_004);

    expect(protection.getAdminSnapshot(3_005)).toEqual({
      windowMinutes: 15,
      loginRequests: 30,
      challengesIssued: 1,
      challengesAccepted: 1,
      challengesRejected: 1,
      failedLogins: 1,
      blockedRequests: 1,
      activeBlockedAddresses: 0,
      attackModeActive: true,
    });
    expect(protection.getAdminSnapshot(903_001)).toMatchObject({
      loginRequests: 0,
      challengesIssued: 0,
      challengesAccepted: 0,
      challengesRejected: 0,
      failedLogins: 0,
      blockedRequests: 0,
      attackModeActive: false,
    });
  });

  it("counts active temporary blocks without exposing addresses and clears expired blocks", () => {
    const protection = new AbuseProtection({ secret: "test-secret" });
    activateAttackMode(protection);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      protection.recordLoginFailure(BLOCKED_IP, 3_000 + attempt);
    }

    const activeSnapshot = protection.getAdminSnapshot(3_003);
    expect(activeSnapshot).toMatchObject({
      failedLogins: 4,
      activeBlockedAddresses: 1,
    });
    expect(Object.keys(activeSnapshot)).toEqual([
      "windowMinutes",
      "loginRequests",
      "challengesIssued",
      "challengesAccepted",
      "challengesRejected",
      "failedLogins",
      "blockedRequests",
      "activeBlockedAddresses",
      "attackModeActive",
    ]);
    expect(JSON.stringify(activeSnapshot)).not.toContain(BLOCKED_IP);

    expect(protection.getAdminSnapshot(903_003)).toMatchObject({
      failedLogins: 0,
      activeBlockedAddresses: 0,
    });
  });
});

function activateAttackMode(protection: AbuseProtection): void {
  for (let second = 0; second < SUSTAINED_SECONDS; second += 1) {
    for (let request = 0; request < LOGIN_RATE_PER_SECOND; request += 1) {
      protection.recordLoginRequest(second * 1_000);
    }
  }
}

function findProof(token: string, difficulty: number): string {
  let counter = 0;
  while (true) {
    const proof = String(counter);
    const digest = createHash("sha256")
      .update(`${token}:${proof}`)
      .digest("hex") as string;
    if (digest.startsWith("0".repeat(difficulty / 4))) return proof;
    counter += 1;
  }
}
