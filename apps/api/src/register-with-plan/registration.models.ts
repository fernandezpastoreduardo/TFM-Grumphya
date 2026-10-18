import { HttpException } from "@nestjs/common";

export const PLAN_CODES = ["ILUMINADO", "FALTON"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export type RegistrationInput = {
  email: string;
  username: string;
  password: string;
  privacyPolicyAcknowledged: true;
};

export type RegistrationIntent = {
  token: string;
  plan: PlanCode;
  expiresAt: Date;
};
export type RegistrationResult = {
  status: "active";
  plan: PlanCode;
  account: AccountProfile;
};
export type VerifiedResult = { status: "email_verified"; plan: PlanCode };
export type ConfirmedRegistration = {
  status: "active";
  plan: PlanCode;
  userId: string;
  username: string;
};
export type SessionPublicResult = {
  status: "active";
  plan: PlanCode;
  account: AccountProfile;
  accessToken: string;
  expiresIn: number;
};
export type SessionIssue = {
  result: SessionPublicResult;
  refreshToken: string;
  rememberMe: boolean;
  expiresAt: Date;
};
export type SessionIdentity = {
  userId: string;
  username: string;
  plan: PlanCode;
  rememberMe: boolean;
  expiresAt: Date;
};
export type AccountPlanStatus = {
  plan: PlanCode;
  status: "active" | "inactive";
  startsAt: string | null;
  expiresAt: string | null;
  attemptsRemaining: { ideas: number; roasts: number };
};
export type AccountProfile = {
  user: {
    email: string;
    username: string;
    emailVerified: boolean;
    createdAt: string;
    roastMessagesSent: number;
  };
  plans: AccountPlanStatus[];
};
export type DirectRegistration = {
  userId: string;
  plan: PlanCode;
  account: AccountProfile;
};
export type LoginIdentity = {
  userId: string;
  username: string;
  passwordHash: string;
};
export type UserGoodIdea = {
  id: string;
  title: string;
  createdAt: string;
};
export type UserGoodIdeas = { ideas: UserGoodIdea[] };

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
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super({ statusCode, code, message }, statusCode);
  }
}
