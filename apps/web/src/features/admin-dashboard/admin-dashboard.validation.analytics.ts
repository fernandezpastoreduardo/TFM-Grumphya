import type { AnonymousAnalyticsData } from "./admin-dashboard.models";
import {
  DASHBOARD_MONTH_PATTERN,
  hasExactKeys,
  isCount,
  isRecord,
} from "./admin-dashboard.validation.shared";

const ANALYTICS_PAGES: readonly string[] = [
  "home",
  "precios",
  "buenas-practicas",
  "humanos-notables",
  "lo-peor-de-lo-peor",
  "contacto",
  "descargate",
  "other_public_pages",
];
export function isAnonymousAnalyticsData(
  value: unknown,
): value is AnonymousAnalyticsData {
  if (
    !isRecord(value) ||
    !Array.isArray(value.viewsByPage) ||
    !Array.isArray(value.deviceShares) ||
    !Array.isArray(value.monthlyPlanSelections) ||
    !Array.isArray(value.monthlyPlanActivations)
  )
    return false;
  return (
    value.viewsByPage.every(
      (entry) =>
        isRecord(entry) &&
        hasExactKeys(entry, ["page", "count"]) &&
        typeof entry.page === "string" &&
        ANALYTICS_PAGES.includes(entry.page) &&
        isSuppressedCount(entry.count),
    ) &&
    value.deviceShares.every(
      (entry) =>
        isRecord(entry) &&
        hasExactKeys(entry, ["device", "percentage"]) &&
        (entry.device === "mobile" || entry.device === "desktop") &&
        typeof entry.percentage === "number" &&
        Number.isInteger(entry.percentage) &&
        entry.percentage >= 0 &&
        entry.percentage <= 100 &&
        entry.percentage % 5 === 0,
    ) &&
    (value.deviceShares.length !== 2 ||
      value.deviceShares.reduce(
        (sum, entry) =>
          sum +
          (isRecord(entry) && typeof entry.percentage === "number"
            ? entry.percentage
            : 0),
        0,
      ) === 100) &&
    value.monthlyPlanSelections.every(isMonthlyPlanMetric) &&
    value.monthlyPlanActivations.every(isMonthlyPlanMetric)
  );
}
function isSuppressedCount(value: unknown): value is number {
  return isCount(value) && Number.isSafeInteger(value) && value >= 10;
}
function isMonthlyPlanMetric(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["month", "plan", "count"]) &&
    typeof value.month === "string" &&
    DASHBOARD_MONTH_PATTERN.test(value.month) &&
    (value.plan === "ILUMINADO" || value.plan === "FALTON") &&
    isSuppressedCount(value.count)
  );
}
