import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const REQUESTS_PER_SECOND_THRESHOLD = 10;
const SUSTAINED_WINDOW_COUNT = 3;
const ATTACK_MODE_TTL_MS = 15 * 60 * 1000;
const FAILED_LOGIN_BLOCK_THRESHOLD = 4;
const FAILED_LOGIN_BLOCK_MS = 15 * 60 * 1000;
const CHALLENGE_TTL_MS = 60 * 1000;
const CHALLENGE_DIFFICULTY_BITS = 16;
const MAX_TRACKED_ENTRIES = 20_000;
const DEFAULT_DEVELOPMENT_SECRET = "local-login-challenge-only";
const LOGIN_TELEMETRY_WINDOW_MINUTES = 15;
const LOGIN_TELEMETRY_BUCKET_LIMIT = LOGIN_TELEMETRY_WINDOW_MINUTES + 1;

type LoginTelemetryMetric =
  | "loginRequests"
  | "challengesIssued"
  | "challengesAccepted"
  | "challengesRejected"
  | "failedLogins"
  | "blockedRequests";
type LoginTelemetryBucket = Record<LoginTelemetryMetric, number>;

type LoginChallengePayload = {
  id: string;
  expiresAt: number;
  addressKey: string;
};

type FailureBucket = {
  count: number;
  expiresAt: number;
  blockedUntil?: number;
};
type RecentFailureBucket = { timestamps: number[] };

export type LoginChallenge = { token: string; difficulty: number };

export class LoginAbuseProtection {
  private readonly secret: string;
  private readonly requestsBySecond = new Map<number, number>();
  private readonly failedLogins = new Map<string, FailureBucket>();
  private readonly recentFailedLogins = new Map<string, RecentFailureBucket>();
  private readonly consumedChallenges = new Map<string, number>();
  private readonly loginTelemetry = new Map<number, LoginTelemetryBucket>();
  private attackModeUntil = 0;

  constructor(options: { secret?: string } = {}) {
    this.secret =
      options.secret ??
      process.env.LOGIN_CHALLENGE_SECRET ??
      process.env.ACCESS_TOKEN_SECRET ??
      DEFAULT_DEVELOPMENT_SECRET;
  }

  recordLoginRequest(now = Date.now()): void {
    this.recordTelemetry("loginRequests", now);
    const second = Math.floor(now / 1_000);
    this.cleanup(now);
    this.requestsBySecond.set(
      second,
      (this.requestsBySecond.get(second) ?? 0) + 1,
    );
    const sustainedAttack = Array.from(
      { length: SUSTAINED_WINDOW_COUNT },
      (_, index) => this.requestsBySecond.get(second - index) ?? 0,
    ).every((count) => count >= REQUESTS_PER_SECOND_THRESHOLD);
    if (sustainedAttack) {
      this.attackModeUntil = now + ATTACK_MODE_TTL_MS;
      this.applyRecentFailures(now);
    }
  }

  isChallengeModeActive(now = Date.now()): boolean {
    return now < this.attackModeUntil;
  }

  createChallenge(address: string, now = Date.now()): LoginChallenge {
    this.recordTelemetry("challengesIssued", now);
    const payload: LoginChallengePayload = {
      id: randomBytes(18).toString("base64url"),
      expiresAt: now + CHALLENGE_TTL_MS,
      addressKey: this.addressKey(address),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(encoded);
    return {
      token: `${encoded}.${signature}`,
      difficulty: CHALLENGE_DIFFICULTY_BITS,
    };
  }

  verifyChallenge(
    address: string,
    token: string,
    proof: string,
    now = Date.now(),
  ): boolean {
    const accepted = this.verifyChallengeProof(address, token, proof, now);
    this.recordTelemetry(
      accepted ? "challengesAccepted" : "challengesRejected",
      now,
    );
    return accepted;
  }

  private verifyChallengeProof(
    address: string,
    token: string,
    proof: string,
    now: number,
  ): boolean {
    if (
      token.length > 1_024 ||
      proof.length > 12 ||
      !/^\d{1,12}$/u.test(proof)
    ) {
      return false;
    }
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra !== undefined) return false;
    const expectedSignature = this.sign(encoded);
    if (!safeEqual(signature, expectedSignature)) return false;

    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      return false;
    }
    if (!isChallengePayload(payload)) return false;
    if (
      payload.expiresAt <= now ||
      payload.addressKey !== this.addressKey(address) ||
      this.consumedChallenges.has(payload.id) ||
      this.consumedChallenges.size >= MAX_TRACKED_ENTRIES
    ) {
      return false;
    }

    const digest = createHash("sha256")
      .update(`${token}:${proof}`)
      .digest("hex");
    if (!digest.startsWith("0".repeat(CHALLENGE_DIFFICULTY_BITS / 4))) {
      return false;
    }
    this.consumedChallenges.set(payload.id, payload.expiresAt);
    return true;
  }

  recordLoginFailure(address: string, now = Date.now()): void {
    const key = this.addressKey(address);
    if (!this.isChallengeModeActive(now)) {
      const recent = this.recentFailedLogins.get(key) ?? { timestamps: [] };
      recent.timestamps = recent.timestamps.filter(
        (timestamp) => timestamp > now - SUSTAINED_WINDOW_COUNT * 1_000,
      );
      recent.timestamps.push(now);
      this.storeBounded(this.recentFailedLogins, key, recent);
      return;
    }
    this.recordTelemetry("failedLogins", now);
    this.addFailure(key, now);
  }

  recordBlockedLoginRequest(now = Date.now()): void {
    this.recordTelemetry("blockedRequests", now);
  }

  getAdminSnapshot(now = Date.now()) {
    const currentMinute = Math.floor(now / 60_000);
    for (const minute of this.loginTelemetry.keys()) {
      if (minute < currentMinute - LOGIN_TELEMETRY_WINDOW_MINUTES + 1) {
        this.loginTelemetry.delete(minute);
      }
    }
    const totals: LoginTelemetryBucket = createEmptyTelemetryBucket();
    for (const bucket of this.loginTelemetry.values()) {
      for (const metric of Object.keys(totals) as LoginTelemetryMetric[]) {
        totals[metric] += bucket[metric];
      }
    }
    let activeBlockedAddresses = 0;
    for (const bucket of this.failedLogins.values()) {
      if (bucket.blockedUntil && bucket.blockedUntil > now) {
        activeBlockedAddresses += 1;
      }
    }
    return {
      windowMinutes: LOGIN_TELEMETRY_WINDOW_MINUTES as 15,
      ...totals,
      activeBlockedAddresses,
      attackModeActive: this.isChallengeModeActive(now),
    };
  }

  private recordTelemetry(metric: LoginTelemetryMetric, now: number): void {
    const minute = Math.floor(now / 60_000);
    let bucket = this.loginTelemetry.get(minute);
    if (!bucket) {
      bucket = createEmptyTelemetryBucket();
      this.loginTelemetry.set(minute, bucket);
    }
    bucket[metric] += 1;
    for (const recordedMinute of this.loginTelemetry.keys()) {
      if (recordedMinute < minute - LOGIN_TELEMETRY_WINDOW_MINUTES + 1) {
        this.loginTelemetry.delete(recordedMinute);
      }
    }
    while (this.loginTelemetry.size > LOGIN_TELEMETRY_BUCKET_LIMIT) {
      const oldestMinute = this.loginTelemetry.keys().next().value;
      if (oldestMinute === undefined) break;
      this.loginTelemetry.delete(oldestMinute);
    }
  }

  private addFailure(key: string, now: number): void {
    const current = this.failedLogins.get(key);
    const bucket =
      !current || current.expiresAt <= now
        ? { count: 0, expiresAt: now + FAILED_LOGIN_BLOCK_MS }
        : current;
    bucket.count += 1;
    if (bucket.count >= FAILED_LOGIN_BLOCK_THRESHOLD) {
      bucket.blockedUntil = now + FAILED_LOGIN_BLOCK_MS;
    }
    this.storeBounded(this.failedLogins, key, bucket);
  }

  recordLoginSuccess(address: string): void {
    const key = this.addressKey(address);
    this.failedLogins.delete(key);
    this.recentFailedLogins.delete(key);
  }

  getBlockedRetryAfter(address: string, now = Date.now()): number {
    const bucket = this.failedLogins.get(this.addressKey(address));
    if (!bucket?.blockedUntil || bucket.blockedUntil <= now) return 0;
    return Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1_000));
  }

  private addressKey(address: string): string {
    return createHmac("sha256", this.secret)
      .update(`login-abuse-address:${address}`)
      .digest("hex");
  }

  private sign(value: string): string {
    return createHmac("sha256", this.secret)
      .update(`login-challenge:v1:${value}`)
      .digest("base64url");
  }

  private cleanup(now: number): void {
    for (const [second] of this.requestsBySecond) {
      if (second < Math.floor(now / 1_000) - SUSTAINED_WINDOW_COUNT) {
        this.requestsBySecond.delete(second);
      }
    }
    for (const [id, expiresAt] of this.consumedChallenges) {
      if (expiresAt <= now) this.consumedChallenges.delete(id);
    }
    for (const [key, bucket] of this.recentFailedLogins) {
      bucket.timestamps = bucket.timestamps.filter(
        (timestamp) => timestamp > now - SUSTAINED_WINDOW_COUNT * 1_000,
      );
      if (bucket.timestamps.length === 0) this.recentFailedLogins.delete(key);
    }
  }

  private applyRecentFailures(now: number): void {
    for (const [key, bucket] of this.recentFailedLogins) {
      const recentCount = bucket.timestamps.filter(
        (timestamp) => timestamp > now - SUSTAINED_WINDOW_COUNT * 1_000,
      ).length;
      for (let attempt = 0; attempt < recentCount; attempt += 1) {
        this.recordTelemetry("failedLogins", now);
        this.addFailure(key, now);
      }
    }
    this.recentFailedLogins.clear();
  }

  private storeBounded<T>(map: Map<string, T>, key: string, value: T): void {
    if (!map.has(key) && map.size >= MAX_TRACKED_ENTRIES) {
      const oldestKey = map.keys().next().value;
      if (oldestKey) map.delete(oldestKey);
    }
    map.set(key, value);
  }
}

function createEmptyTelemetryBucket(): LoginTelemetryBucket {
  return {
    loginRequests: 0,
    challengesIssued: 0,
    challengesAccepted: 0,
    challengesRejected: 0,
    failedLogins: 0,
    blockedRequests: 0,
  };
}

function safeEqual(value: string, expected: string): boolean {
  const supplied = Buffer.from(value);
  const reference = Buffer.from(expected);
  return (
    supplied.length === reference.length && timingSafeEqual(supplied, reference)
  );
}

function isChallengePayload(value: unknown): value is LoginChallengePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.id === "string" &&
    typeof payload.expiresAt === "number" &&
    Number.isSafeInteger(payload.expiresAt) &&
    typeof payload.addressKey === "string"
  );
}
