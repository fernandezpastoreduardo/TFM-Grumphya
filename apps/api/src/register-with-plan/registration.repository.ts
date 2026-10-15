import type {
  PlanCode,
  PendingRegistration,
  RegistrationInput,
  VerifiedResult,
  ConfirmedRegistration,
  SessionIdentity,
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
  verify(
    verificationHash: string,
    verifiedTokenHash: string,
    verifiedTokenExpiresAt: Date,
  ): Promise<VerifiedResult>;
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
    expiresAt: Date,
  ): Promise<SessionIdentity>;
}

export const REGISTRATION_REPOSITORY = Symbol("REGISTRATION_REPOSITORY");
