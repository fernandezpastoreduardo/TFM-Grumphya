import { randomUUID } from "node:crypto";
import {
  RegistrationError,
  type PlanCode,
  type RegistrationInput,
  type VerifiedResult,
  type SessionIdentity,
  type ConfirmedRegistration,
  type AccountProfile,
  type UserGoodIdea,
  type LoginIdentity,
} from "./registration.models";
import type { RegistrationRepository } from "./registration.repository";

const GOOD_IDEAS_LIMIT = 10;

type TestUser = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  emailVerified: boolean;
  publicRankingsOptIn?: boolean;
  status: "pending_email_verification" | "email_verified" | "active";
};
type TestRegistration = {
  id: string;
  userId: string;
  plan: PlanCode;
  verificationHash: string;
  verificationExpiresAt: Date;
  verifiedTokenHash?: string;
  verifiedTokenExpiresAt?: Date;
  confirmed: boolean;
  resendCount: number;
  lastSentAt: number;
};
type TestSubscription = {
  userId: string;
  plan: PlanCode;
  status: "active" | "expired";
};
type TestSession = {
  userId: string;
  accessHash: string;
  refreshHash: string;
  previousRefreshHash?: string;
  expiresAt: Date;
  rememberMe: boolean;
};

export class InMemoryRegistrationRepository implements RegistrationRepository {
  readonly users: TestUser[] = [];
  readonly registrations: TestRegistration[] = [];
  readonly subscriptions: TestSubscription[] = [];
  readonly purchases: Array<{ userId: string; plan: PlanCode; key: string }> =
    [];
  readonly sessions: TestSession[] = [];
  readonly goodIdeas: Array<
    UserGoodIdea & {
      userId: string;
      submissionHash?: string;
      requestHash?: string;
    }
  > = [];
  private readonly intents = new Map<
    string,
    { plan: PlanCode; expiresAt: Date }
  >();
  async createIntent(
    plan: PlanCode,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    this.intents.set(tokenHash, { plan, expiresAt });
  }
  async currentIntent(tokenHash: string): Promise<PlanCode | null> {
    const intent = this.intents.get(tokenHash);
    return intent && intent.expiresAt.getTime() > Date.now()
      ? intent.plan
      : null;
  }
  async consumeIntentAndRegister(
    tokenHash: string,
    input: RegistrationInput,
    passwordHash: string,
    verificationHash: string,
    verificationExpiresAt: Date,
  ) {
    const plan = await this.currentIntent(tokenHash);
    if (!plan) throw new Error("Registration intent unavailable.");
    const expiredRegistrationIds = new Set(
      this.registrations
        .filter(
          (registration) =>
            registration.verificationExpiresAt.getTime() <= Date.now() &&
            !registration.verifiedTokenHash,
        )
        .map((registration) => registration.userId),
    );
    for (let index = this.users.length - 1; index >= 0; index -= 1) {
      if (expiredRegistrationIds.has(this.users[index]!.id))
        this.users.splice(index, 1);
    }
    for (let index = this.registrations.length - 1; index >= 0; index -= 1) {
      if (expiredRegistrationIds.has(this.registrations[index]!.userId))
        this.registrations.splice(index, 1);
    }
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().normalize("NFC");
    const normalizedUsername = username.toLowerCase();
    if (
      this.users.some(
        (user) =>
          user.email === email ||
          user.username.toLowerCase() === normalizedUsername,
      )
    ) {
      throw Object.assign(new Error("Unique conflict"), { code: "23505" });
    }
    this.intents.delete(tokenHash);
    const id = randomUUID();
    const user = {
      id,
      email,
      username,
      passwordHash,
      emailVerified: false,
      status: "pending_email_verification" as const,
    };
    this.users.push(user);
    const registrationId = randomUUID();
    this.registrations.push({
      id: registrationId,
      userId: id,
      plan,
      verificationHash,
      verificationExpiresAt,
      confirmed: false,
      resendCount: 0,
      lastSentAt: Date.now(),
    });
    return { id: registrationId, email };
  }
  async replaceVerificationToken(
    email: string,
    verificationHash: string,
    verificationExpiresAt: Date,
  ) {
    const user = this.users.find((item) => item.email === email);
    const registration = user
      ? this.registrations.find(
          (item) => item.userId === user.id && !item.verifiedTokenHash,
        )
      : undefined;
    if (
      !user ||
      !registration ||
      registration.resendCount >= 5 ||
      registration.lastSentAt > Date.now() - 60_000
    ) {
      return null;
    }
    registration.verificationHash = verificationHash;
    registration.verificationExpiresAt = verificationExpiresAt;
    registration.resendCount += 1;
    registration.lastSentAt = Date.now();
    return { id: registration.id, email: user.email };
  }
  async releaseVerificationResendCooldown(
    registrationId: string,
  ): Promise<void> {
    const registration = this.registrations.find(
      (item) => item.id === registrationId,
    );
    if (registration) registration.lastSentAt = Date.now() - 61_000;
  }
  async findLoginIdentity(identifier: string): Promise<LoginIdentity | null> {
    const normalized = identifier.trim().toLowerCase();
    const user = this.users.find(
      (item) =>
        item.status === "active" &&
        (item.email.toLowerCase() === normalized ||
          item.username.toLowerCase() === normalized),
    );
    return user
      ? {
          userId: user.id,
          username: user.username,
          passwordHash: user.passwordHash,
        }
      : null;
  }
  async updatePasswordHash(
    userId: string,
    expectedHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    const user = this.users.find(
      (item) => item.id === userId && item.passwordHash === expectedHash,
    );
    if (!user) return false;
    user.passwordHash = passwordHash;
    return true;
  }
  async verify(
    verificationHash: string,
    verifiedTokenHash: string,
    verifiedTokenExpiresAt: Date,
  ): Promise<VerifiedResult> {
    const registration = this.registrations.find(
      (item) =>
        item.verificationHash === verificationHash &&
        item.verificationExpiresAt.getTime() > Date.now() &&
        !item.verifiedTokenHash,
    );
    if (!registration) throw new Error("Verification unavailable.");
    registration.verifiedTokenHash = verifiedTokenHash;
    registration.verifiedTokenExpiresAt = verifiedTokenExpiresAt;
    registration.verificationHash = "consumed";
    const user = this.users.find((item) => item.id === registration.userId);
    if (user) {
      user.emailVerified = true;
      user.status = "email_verified";
    }
    return { status: "email_verified", plan: registration.plan };
  }
  async getVerifiedRegistrationUserId(
    verifiedTokenHash: string,
  ): Promise<string | null> {
    const registration = this.registrations.find(
      (item) =>
        item.verifiedTokenHash === verifiedTokenHash &&
        item.verifiedTokenExpiresAt &&
        item.verifiedTokenExpiresAt.getTime() > Date.now() &&
        !item.confirmed,
    );
    return registration?.userId ?? null;
  }
  async confirm(
    verifiedTokenHash: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<ConfirmedRegistration> {
    const registration = this.registrations.find(
      (item) =>
        item.verifiedTokenHash === verifiedTokenHash &&
        item.verifiedTokenExpiresAt &&
        item.verifiedTokenExpiresAt.getTime() > Date.now() &&
        !item.confirmed,
    );
    if (!registration)
      throw new RegistrationError(
        400,
        "VERIFICATION_REQUIRED",
        "Verification required.",
      );
    this.subscriptions.push({
      userId: registration.userId,
      plan: registration.plan,
      status: "active",
    });
    registration.confirmed = true;
    const user = this.users.find((item) => item.id === registration.userId);
    if (user) user.status = "active";
    this.sessions.push({
      userId: registration.userId,
      accessHash: accessTokenHash,
      refreshHash: refreshTokenHash,
      expiresAt,
      rememberMe: false,
    });
    return {
      status: "active",
      plan: registration.plan,
      userId: registration.userId,
      username: this.users.find((user) => user.id === registration.userId)!
        .username,
    };
  }
  async createSession(
    userId: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    expiresAt: Date,
    rememberMe: boolean,
  ): Promise<void> {
    this.sessions.push({
      userId,
      accessHash: accessTokenHash,
      refreshHash: refreshTokenHash,
      expiresAt,
      rememberMe,
    });
  }
  async rotateSession(
    refreshTokenHash: string,
    accessTokenHash: string,
    nextRefreshTokenHash: string,
  ): Promise<SessionIdentity> {
    const session = this.sessions.find(
      (item) =>
        item.refreshHash === refreshTokenHash &&
        item.expiresAt.getTime() > Date.now(),
    );
    if (!session) throw new Error("Refresh token unavailable.");
    session.accessHash = accessTokenHash;
    session.previousRefreshHash = session.refreshHash;
    session.refreshHash = nextRefreshTokenHash;
    return {
      userId: session.userId,
      username: this.users.find((user) => user.id === session.userId)!.username,
      plan: this.subscriptions.find((sub) => sub.userId === session.userId)!
        .plan,
      rememberMe: session.rememberMe,
      expiresAt: session.expiresAt,
    };
  }

  async revokeSession(refreshTokenHash: string): Promise<void> {
    const session = this.sessions.find(
      (item) =>
        item.refreshHash === refreshTokenHash ||
        item.previousRefreshHash === refreshTokenHash,
    );
    if (session) session.expiresAt = new Date(0);
  }

  async getSessionIdentity(
    refreshTokenHash: string,
  ): Promise<SessionIdentity | null> {
    const session = this.sessions.find(
      (item) =>
        item.refreshHash === refreshTokenHash &&
        item.expiresAt.getTime() > Date.now(),
    );
    if (!session) return null;
    const user = this.users.find((item) => item.id === session.userId);
    const subscription = this.subscriptions.find(
      (item) => item.userId === session.userId,
    );
    if (!user || !subscription) return null;
    return {
      userId: session.userId,
      username: user.username,
      plan: subscription.plan,
      rememberMe: session.rememberMe,
      expiresAt: session.expiresAt,
    };
  }

  async isActive(accessTokenHash: string, userId: string): Promise<boolean> {
    return this.sessions.some(
      (session) =>
        session.userId === userId &&
        session.accessHash === accessTokenHash &&
        session.expiresAt.getTime() > Date.now(),
    );
  }

  async getProfile(refreshTokenHash: string): Promise<AccountProfile | null> {
    const session = this.sessions.find(
      (item) =>
        item.refreshHash === refreshTokenHash &&
        item.expiresAt.getTime() > Date.now(),
    );
    if (!session) return null;
    const user = this.users.find((item) => item.id === session.userId);
    if (!user) return null;
    return {
      user: {
        role: "user",
        email: user.email,
        username: user.username,
        emailVerified: user.emailVerified,
        createdAt: new Date().toISOString(),
        roastMessagesSent: 0,
        publicRankingsOptIn: user.publicRankingsOptIn ?? false,
      },
      plans: (["ILUMINADO", "FALTON"] as const).map((plan) => {
        const active = this.subscriptions.some(
          (subscription) =>
            subscription.userId === user.id &&
            subscription.plan === plan &&
            subscription.status === "active",
        );
        return {
          plan,
          status: active ? ("active" as const) : ("inactive" as const),
          startsAt: active ? new Date().toISOString() : null,
          expiresAt: active
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : null,
          attemptsRemaining: active
            ? plan === "ILUMINADO"
              ? { ideas: 11, roasts: 0 }
              : { ideas: 0, roasts: 11 }
            : { ideas: 0, roasts: 0 },
        };
      }),
    };
  }

  async getProfileForUser(userId: string): Promise<AccountProfile | null> {
    const session = this.sessions.find(
      (item) => item.userId === userId && item.expiresAt.getTime() > Date.now(),
    );
    return session ? this.getProfile(session.refreshHash) : null;
  }

  async setPublicRankingsOptIn(
    userId: string,
    enabled: boolean,
  ): Promise<AccountProfile | null> {
    const user = this.users.find((item) => item.id === userId);
    if (!user) return null;
    user.publicRankingsOptIn = enabled;
    return this.getProfileForUser(userId);
  }

  async listGoodIdeas(userId: string): Promise<UserGoodIdea[]> {
    return this.goodIdeas
      .filter((idea) => idea.userId === userId)
      .sort((first, second) => {
        const dateOrder = second.createdAt.localeCompare(first.createdAt);
        return dateOrder || second.id.localeCompare(first.id);
      })
      .slice(0, GOOD_IDEAS_LIMIT)
      .map(({ id, title, createdAt }) => ({ id, title, createdAt }));
  }

  async saveGoodIdea(
    userId: string,
    title: string,
    submissionHash: string,
    requestHash: string,
  ): Promise<boolean> {
    const existing = this.goodIdeas.find(
      (idea) =>
        idea.userId === userId && idea.submissionHash === submissionHash,
    );
    if (existing) return existing.requestHash === requestHash;
    this.goodIdeas.push({
      id: randomUUID(),
      userId,
      title,
      createdAt: new Date().toISOString(),
      submissionHash,
      requestHash,
    });
    return true;
  }

  async createSubscriptionPurchase(
    userId: string,
    plan: PlanCode,
    idempotencyKey: string,
  ): Promise<AccountProfile | null> {
    const session = this.sessions.find(
      (item) => item.userId === userId && item.expiresAt.getTime() > Date.now(),
    );
    if (!session) return null;
    const priorPurchase = this.purchases.find(
      (purchase) => purchase.key === idempotencyKey,
    );
    if (priorPurchase) {
      return priorPurchase.userId === userId && priorPurchase.plan === plan
        ? this.getProfile(session.refreshHash)
        : null;
    }
    if (
      this.subscriptions.some(
        (subscription) =>
          subscription.userId === userId &&
          subscription.plan === plan &&
          subscription.status === "active",
      )
    ) {
      throw new Error("PLAN_ALREADY_ACTIVE");
    }
    this.subscriptions.push({ userId, plan, status: "active" });
    this.purchases.push({ userId, plan, key: idempotencyKey });
    return this.getProfile(session.refreshHash);
  }
}
