export type AnonymousUsageScope = "ideas" | "roasts";

export type AnonymousQuota = {
  limit: 3;
  used: number;
  remaining: number;
};

export type AnonymousUsageState = {
  ideas: AnonymousQuota;
  roasts: AnonymousQuota;
};

export type ReservationResult =
  | { state: "reserved"; usage: AnonymousUsageState }
  | { state: "cached"; response: unknown; usage: AnonymousUsageState };

export interface AnonymousUsageRepository {
  initialize(tokenHash: string, ipHmac: string): Promise<boolean>;
  getUsage(tokenHash: string): Promise<AnonymousUsageState | null>;
  reserve(
    tokenHash: string,
    scope: AnonymousUsageScope,
    idempotencyHash: string,
    requestHash: string,
  ): Promise<ReservationResult>;
  commit(
    tokenHash: string,
    scope: AnonymousUsageScope,
    idempotencyHash: string,
    requestHash: string,
    response: unknown,
  ): Promise<AnonymousUsageState>;
  release(
    tokenHash: string,
    scope: AnonymousUsageScope,
    idempotencyHash: string,
  ): Promise<void>;
}

export const ANONYMOUS_USAGE_REPOSITORY = Symbol("ANONYMOUS_USAGE_REPOSITORY");
