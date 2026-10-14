import { randomUUID } from "node:crypto";
import {
  RegistrationError,
  type PlanCode,
  type RegistrationInput,
  type VerifiedResult,
  type SessionIdentity,
  type ConfirmedRegistration,
} from "./registration.models";
import type { RegistrationRepository } from "./registration.repository";

type TestUser = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
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
};
type TestSubscription = { userId: string; plan: PlanCode };
type TestSession = {
  userId: string;
  accessHash: string;
  refreshHash: string;
  expiresAt: Date;
};

export class InMemoryRegistrationRepository implements RegistrationRepository {
  readonly users: TestUser[] = [];
  readonly registrations: TestRegistration[] = [];
  readonly subscriptions: TestSubscription[] = [];
  readonly sessions: TestSession[] = [];
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
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase();
    if (
      this.users.some(
        (user) => user.email === email || user.username === username,
      )
    ) {
      throw Object.assign(new Error("Unique conflict"), { code: "23505" });
    }
    this.intents.delete(tokenHash);
    const id = randomUUID();
    const user = { id, email, username, passwordHash };
    this.users.push(user);
    this.registrations.push({
      id: randomUUID(),
      userId: id,
      plan,
      verificationHash,
      verificationExpiresAt,
      confirmed: false,
    });
    return {
      id,
      email,
      username,
      passwordHash,
      plan,
      verificationHash,
      verificationExpiresAt,
    };
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
    return { status: "email_verified", plan: registration.plan };
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
    });
    registration.confirmed = true;
    this.sessions.push({
      userId: registration.userId,
      accessHash: accessTokenHash,
      refreshHash: refreshTokenHash,
      expiresAt,
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
  ): Promise<void> {
    this.sessions.push({
      userId,
      accessHash: accessTokenHash,
      refreshHash: refreshTokenHash,
      expiresAt,
    });
  }
  async rotateSession(
    refreshTokenHash: string,
    accessTokenHash: string,
    nextRefreshTokenHash: string,
    expiresAt: Date,
  ): Promise<SessionIdentity> {
    const session = this.sessions.find(
      (item) =>
        item.refreshHash === refreshTokenHash &&
        item.expiresAt.getTime() > Date.now(),
    );
    if (!session) throw new Error("Refresh token unavailable.");
    session.accessHash = accessTokenHash;
    session.refreshHash = nextRefreshTokenHash;
    session.expiresAt = new Date(
      Math.min(session.expiresAt.getTime(), expiresAt.getTime()),
    );
    return {
      userId: session.userId,
      username: this.users.find((user) => user.id === session.userId)!.username,
      plan: this.subscriptions.find((sub) => sub.userId === session.userId)!
        .plan,
    };
  }
}
