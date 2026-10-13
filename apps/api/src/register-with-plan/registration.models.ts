import { HttpException } from "@nestjs/common";

export const PLAN_CODES = ["ILUMINADO", "FALTON"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export type RegistrationInput = {
  email: string;
  username: string;
  password: string;
  privacyPolicyAcknowledged: true;
};

export type RegistrationIntent = { token: string; plan: PlanCode; expiresAt: Date };
export type RegistrationResult = { status: "pending_email_verification"; message: string; verificationExpiresAt: string };
export type VerifiedResult = { status: "email_verified"; plan: PlanCode };
export type ConfirmedRegistration = { status: "active"; plan: PlanCode; userId: string; username: string };
export type SessionPublicResult = { status: "active"; plan: PlanCode; accessToken: string; expiresIn: number };
export type SessionIssue = { result: SessionPublicResult; refreshToken: string };
export type SessionIdentity = { userId: string; username: string; plan: PlanCode };

export type PendingRegistration = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  plan: PlanCode;
  verificationHash: string;
  verificationExpiresAt: Date;
  verifiedToken?: string;
};

export class RegistrationError extends HttpException {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super({ statusCode, code, message }, statusCode);
  }
}
