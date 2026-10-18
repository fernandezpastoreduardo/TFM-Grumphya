export type PlanUsageScope = "ideas" | "roasts";

export type PlanUsageReservation =
  { state: "reserved" } | { state: "cached"; response: unknown };

export interface PlanUsageRepository {
  reserve(
    userId: string,
    scope: PlanUsageScope,
    idempotencyHash: string,
    requestHash: string,
  ): Promise<PlanUsageReservation>;
  commit(
    userId: string,
    scope: PlanUsageScope,
    idempotencyHash: string,
    requestHash: string,
    response: unknown,
  ): Promise<void>;
  recordHistoricalRoastMessage(userId: string, idempotencyHash: string): Promise<void>;
  release(
    userId: string,
    scope: PlanUsageScope,
    idempotencyHash: string,
  ): Promise<void>;
}

export const PLAN_USAGE_REPOSITORY = Symbol("PLAN_USAGE_REPOSITORY");
