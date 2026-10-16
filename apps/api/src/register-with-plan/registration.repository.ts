import type {
  PlanCode,
  LoginIdentity,
  PendingRegistration,
  RegistrationInput,
  VerifiedResult,
  ConfirmedRegistration,
  SessionIdentity,
  AccountProfile,
  DirectRegistration,
  UserGoodIdea,
} from "./registration.models";

export interface RegistrationRepository {
  createIntent(
    plan: PlanCode,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  currentIntent(tokenHash: string): Promise<PlanCode | null>;
  consumeIntentAndRegister(
    tokenHash: string,
    input: RegistrationInput,
    passwordHash: string,
    verificationHash: string,
    verificationExpiresAt: Date,
  ): Promise<PendingRegistration>;
  activateWithRegistration(
    userId: string,
    tokenHash: string,
    input: RegistrationInput,
    passwordHash: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    sessionExpiresAt: Date,
  ): Promise<DirectRegistration>;
  findLoginIdentity(identifier: string): Promise<LoginIdentity | null>;
  createSession(
    userId: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    expiresAt: Date,
    rememberMe: boolean,
  ): Promise<void>;
  revokeSession(refreshTokenHash: string): Promise<void>;
  getSessionIdentity(refreshTokenHash: string): Promise<SessionIdentity | null>;
  verify(
    verificationHash: string,
    verifiedTokenHash: string,
    verifiedTokenExpiresAt: Date,
  ): Promise<VerifiedResult>;
  getVerifiedRegistrationUserId(
    verifiedTokenHash: string,
  ): Promise<string | null>;
  confirm(
    verifiedTokenHash: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<ConfirmedRegistration>;
  rotateSession(
    refreshTokenHash: string,
    accessTokenHash: string,
    nextRefreshTokenHash: string,
  ): Promise<SessionIdentity>;
  getProfile(refreshTokenHash: string): Promise<AccountProfile | null>;
  getProfileForUser(userId: string): Promise<AccountProfile | null>;
  listGoodIdeas(userId: string): Promise<UserGoodIdea[]>;
  saveGoodIdea(
    userId: string,
    title: string,
    submissionHash: string,
    requestHash: string,
  ): Promise<boolean>;
  createSubscriptionPurchase(
    userId: string,
    plan: PlanCode,
    idempotencyKey: string,
  ): Promise<AccountProfile | null>;
}

export const REGISTRATION_REPOSITORY = Symbol("REGISTRATION_REPOSITORY");
