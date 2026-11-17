import type {
  LoginSecurityMetrics,
  RecentAiActivity,
  TokenVolumeBucket,
} from "./admin-dashboard.models";
import {
  hasExactKeys,
  isCount,
  isIsoDateTime,
  isNullableCount,
  isRecord,
} from "./admin-dashboard.validation.shared";

const RECENT_AI_ACTIVITY_KEYS = [
  "hour",
  "operation",
  "model",
  "eventCount",
  "inputTokenBucket",
  "cachedInputTokenBucket",
  "outputTokenBucket",
  "estimatedCostUsd",
] as const;
const SAFE_AI_MODEL_PATTERN = /^[a-zA-Z0-9._:-]{1,100}$/u;
function isTokenVolumeBucket(value: unknown): value is TokenVolumeBucket {
  return (
    value === "under_1k" ||
    value === "1k_5k" ||
    value === "5k_20k" ||
    value === "20k_plus"
  );
}
export function isRecentAiActivity(value: unknown): value is RecentAiActivity {
  return (
    isRecord(value) &&
    hasExactKeys(value, RECENT_AI_ACTIVITY_KEYS) &&
    isIsoDateTime(value.hour) &&
    (value.operation === "idea_evaluation" || value.operation === "roast") &&
    typeof value.model === "string" &&
    SAFE_AI_MODEL_PATTERN.test(value.model) &&
    isCount(value.eventCount) &&
    Number.isSafeInteger(value.eventCount) &&
    value.eventCount > 0 &&
    isTokenVolumeBucket(value.inputTokenBucket) &&
    isTokenVolumeBucket(value.cachedInputTokenBucket) &&
    isTokenVolumeBucket(value.outputTokenBucket) &&
    isNullableCount(value.estimatedCostUsd)
  );
}

const LOGIN_SECURITY_KEYS = [
  "windowMinutes",
  "loginRequests",
  "challengesIssued",
  "challengesAccepted",
  "challengesRejected",
  "failedLogins",
  "blockedRequests",
  "activeBlockedAddresses",
  "attackModeActive",
] as const;
export function isLoginSecurityMetrics(
  value: unknown,
): value is LoginSecurityMetrics {
  return (
    isRecord(value) &&
    hasExactKeys(value, LOGIN_SECURITY_KEYS) &&
    value.windowMinutes === 15 &&
    isCount(value.loginRequests) &&
    Number.isSafeInteger(value.loginRequests) &&
    isCount(value.challengesIssued) &&
    Number.isSafeInteger(value.challengesIssued) &&
    isCount(value.challengesAccepted) &&
    Number.isSafeInteger(value.challengesAccepted) &&
    isCount(value.challengesRejected) &&
    Number.isSafeInteger(value.challengesRejected) &&
    isCount(value.failedLogins) &&
    Number.isSafeInteger(value.failedLogins) &&
    isCount(value.blockedRequests) &&
    Number.isSafeInteger(value.blockedRequests) &&
    isCount(value.activeBlockedAddresses) &&
    Number.isSafeInteger(value.activeBlockedAddresses) &&
    typeof value.attackModeActive === "boolean"
  );
}
export function hasUniqueRecentAiActivity(
  activities: RecentAiActivity[],
): boolean {
  const groupKeys = activities.map(
    ({ hour, operation, model }) => `${hour}\u0000${operation}\u0000${model}`,
  );
  return new Set(groupKeys).size === groupKeys.length;
}
export function getAiOperationLabel(
  operation: RecentAiActivity["operation"],
): string {
  if (operation === "idea_evaluation") return "Evaluación de idea";
  return "Envío de roast";
}
export function getTokenVolumeLabel(bucket: TokenVolumeBucket): string {
  if (bucket === "under_1k") return "Menos de 1.000";
  if (bucket === "1k_5k") return "1.000–4.999";
  if (bucket === "5k_20k") return "5.000–19.999";
  return "20.000 o más";
}
