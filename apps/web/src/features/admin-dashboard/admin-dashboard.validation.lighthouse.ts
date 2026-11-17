import type { AdminLighthouseRun } from "./admin-dashboard.models";
import {
  hasExactKeys,
  isFiniteNumber,
  isIsoDateTime,
  isNullableCount,
  isRecord,
} from "./admin-dashboard.validation.shared";

const LIGHTHOUSE_RUN_KEYS = [
  "commitSha",
  "measuredAt",
  "page",
  "device",
  "sampleCount",
  "performance",
  "accessibility",
  "bestPractices",
  "seo",
  "lcpMs",
  "cls",
  "tbtMs",
  "speedIndexMs",
] as const;
const LIGHTHOUSE_PAGES = ["home", "precios", "lo-peor-de-lo-peor"] as const;
function isLighthouseRun(value: unknown): value is AdminLighthouseRun {
  return (
    isRecord(value) &&
    hasExactKeys(value, LIGHTHOUSE_RUN_KEYS) &&
    typeof value.commitSha === "string" &&
    /^[a-f0-9]{40}$/u.test(value.commitSha) &&
    isIsoDateTime(value.measuredAt) &&
    LIGHTHOUSE_PAGES.includes(
      value.page as (typeof LIGHTHOUSE_PAGES)[number],
    ) &&
    (value.device === "mobile" || value.device === "desktop") &&
    value.sampleCount === 3 &&
    [
      value.performance,
      value.accessibility,
      value.bestPractices,
      value.seo,
    ].every((score) => isFiniteNumber(score) && score >= 0 && score <= 1) &&
    [value.lcpMs, value.cls, value.tbtMs, value.speedIndexMs].every(
      isNullableCount,
    )
  );
}
export function isLighthouseQuality(
  value: unknown,
): value is { runs: AdminLighthouseRun[] } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["runs"]) &&
    Array.isArray(value.runs) &&
    value.runs.length <= 6 &&
    value.runs.every(isLighthouseRun)
  );
}
