import { isPublicAvatarUrl } from "../../infrastructure/avatar/public-avatar-url";
import { PLAN_CODES } from "./user-profile.constants";
import type {
  AccountProfile,
  AccountPlan,
  GoodIdea,
} from "./user-profile.models";

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isDateOrNull(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)))
  );
}

export function isAccountPlan(value: unknown): value is AccountPlan {
  if (!isRecord(value) || !isRecord(value.attemptsRemaining)) return false;
  return (
    (value.plan === "ILUMINADO" || value.plan === "FALTON") &&
    (value.status === "active" || value.status === "inactive") &&
    isDateOrNull(value.startsAt) &&
    isDateOrNull(value.expiresAt) &&
    isNonNegativeInteger(value.attemptsRemaining.ideas) &&
    isNonNegativeInteger(value.attemptsRemaining.roasts)
  );
}

export function isAccountProfile(value: unknown): value is AccountProfile {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  const plans = value.plans;
  if (!Array.isArray(plans)) return false;
  return (
    typeof value.user.email === "string" &&
    typeof value.user.username === "string" &&
    (value.user.role === "user" || value.user.role === "admin") &&
    typeof value.user.emailVerified === "boolean" &&
    typeof value.user.publicRankingsOptIn === "boolean" &&
    typeof value.user.createdAt === "string" &&
    Number.isFinite(Date.parse(value.user.createdAt)) &&
    (value.user.avatarUrl === undefined ||
      value.user.avatarUrl === null ||
      isPublicAvatarUrl(value.user.avatarUrl)) &&
    plans.length === PLAN_CODES.length &&
    plans.every(isAccountPlan) &&
    PLAN_CODES.every((code) =>
      plans.some((plan) => isAccountPlan(plan) && plan.plan === code),
    )
  );
}

export function isGoodIdea(value: unknown): value is GoodIdea {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt))
  );
}

export function isGoodIdeasResponse(
  value: unknown,
): value is { ideas: GoodIdea[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.ideas) &&
    value.ideas.every(isGoodIdea)
  );
}
