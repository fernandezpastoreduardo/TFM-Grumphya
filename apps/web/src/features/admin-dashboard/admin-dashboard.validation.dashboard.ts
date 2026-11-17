import type {
  ActivePlanWeek,
  AiCostByActor,
  AiCostTrendWeek,
  DashboardData,
  FinanceMonth,
  MaximumPlanCost,
} from "./admin-dashboard.models";
import {
  DASHBOARD_MONTH_PATTERN,
  DIAGNOSTIC_CODE_PATTERN,
  ERROR_EVENT_ID_PATTERN,
  isCount,
  isFiniteNumber,
  isNullableCount,
  isIsoDay,
  isRecord,
} from "./admin-dashboard.validation.shared";
import {
  hasUniqueRecentAiActivity,
  isLoginSecurityMetrics,
  isRecentAiActivity,
} from "./admin-dashboard.validation.operations";

function isMaximumPlanCost(value: unknown): value is MaximumPlanCost {
  return (
    isRecord(value) &&
    isNullableCount(value.averagePerAttemptUsd) &&
    isNullableCount(value.monthlyMaximumUsd) &&
    isCount(value.pricedAttempts) &&
    Number.isInteger(value.pricedAttempts) &&
    ((value.pricedAttempts === 0 &&
      value.averagePerAttemptUsd === null &&
      value.monthlyMaximumUsd === null) ||
      (value.pricedAttempts > 0 &&
        value.averagePerAttemptUsd !== null &&
        value.monthlyMaximumUsd !== null))
  );
}
function isActivePlanWeek(value: unknown): value is ActivePlanWeek {
  return (
    isRecord(value) &&
    isIsoDay(value.weekStart) &&
    isCount(value.iluminado) &&
    isCount(value.falton) &&
    Number.isInteger(value.iluminado) &&
    Number.isInteger(value.falton)
  );
}
function isFinanceMonth(value: unknown): value is FinanceMonth {
  return (
    isRecord(value) &&
    typeof value.month === "string" &&
    DASHBOARD_MONTH_PATTERN.test(value.month) &&
    isCount(value.revenueEur) &&
    isCount(value.aiCostUsd) &&
    isCount(value.aiCostEur) &&
    isCount(value.hostingEur) &&
    isCount(value.expensesEur) &&
    isFiniteNumber(value.netEur)
  );
}
function isAiCostByActor(value: unknown): value is AiCostByActor {
  return (
    isRecord(value) &&
    isCount(value.registeredUsersUsd) &&
    isCount(value.adminsUsd) &&
    isCount(value.anonymousUsd)
  );
}
function isAiCostTrendWeek(value: unknown): value is AiCostTrendWeek {
  return (
    isRecord(value) &&
    isIsoDay(value.weekStart) &&
    isCount(value.totalUsd) &&
    isAiCostByActor(value)
  );
}
export function isDashboardData(value: unknown): value is DashboardData {
  return (
    isRecord(value) &&
    isDashboardRevenue(value.revenue) &&
    isDashboardMaximumCost(value.maximumMonthlyCost) &&
    Array.isArray(value.weeklyActivePlans) &&
    value.weeklyActivePlans.every(isActivePlanWeek) &&
    isDashboardAnnualFinance(value.annualFinance) &&
    isDashboardAiCost(value.estimatedAiCost) &&
    Array.isArray(value.recentAiActivity) &&
    value.recentAiActivity.every(isRecentAiActivity) &&
    hasUniqueRecentAiActivity(value.recentAiActivity) &&
    isLoginSecurityMetrics(value.loginSecurity) &&
    Array.isArray(value.errors) &&
    value.errors.every(isDashboardError)
  );
}
function isDashboardRevenue(value: unknown): boolean {
  return isRecord(value) && isCount(value.weeklyEur) && isCount(value.totalEur);
}
function isDashboardMaximumCost(value: unknown): boolean {
  return (
    isRecord(value) &&
    isMaximumPlanCost(value.iluminado) &&
    isMaximumPlanCost(value.falton) &&
    isCount(value.dailyAttempts) &&
    Number.isInteger(value.dailyAttempts) &&
    isCount(value.assumedDaysPerMonth) &&
    Number.isInteger(value.assumedDaysPerMonth)
  );
}
function isDashboardAnnualFinance(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCount(value.year) &&
    Number.isInteger(value.year) &&
    isCount(value.hostingMonthlyEur) &&
    typeof value.hostingStartsMonth === "string" &&
    DASHBOARD_MONTH_PATTERN.test(value.hostingStartsMonth) &&
    isCount(value.usdToEurRate) &&
    value.usdToEurRate > 0 &&
    value.exchangeRateSource === "BCE" &&
    isIsoDay(value.exchangeRateAsOf) &&
    Array.isArray(value.months) &&
    value.months.every(isFinanceMonth)
  );
}
function isDashboardAiCost(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCount(value.weeklyUsd) &&
    isCount(value.totalUsd) &&
    isCount(value.weeklyAveragePerAccountUsd) &&
    isCount(value.totalAveragePerAccountUsd) &&
    isCount(value.activeRegisteredAccountCount) &&
    isCount(value.activeAdminAccountCount) &&
    isAiCostByActor(value.weeklyByActor) &&
    isAiCostByActor(value.totalByActor) &&
    Array.isArray(value.weeklyTrend) &&
    value.weeklyTrend.every(isAiCostTrendWeek) &&
    isCount(value.unpricedUsageEvents)
  );
}
function isDashboardError(item: unknown): boolean {
  return (
    isRecord(item) &&
    typeof item.code === "string" &&
    typeof item.latestEventId === "string" &&
    ERROR_EVENT_ID_PATTERN.test(item.latestEventId) &&
    isCount(item.weeklyCount) &&
    isCount(item.totalCount) &&
    typeof item.lastOccurredAt === "string" &&
    Number.isFinite(Date.parse(item.lastOccurredAt)) &&
    (item.latestDiagnosticCode === null ||
      (typeof item.latestDiagnosticCode === "string" &&
        DIAGNOSTIC_CODE_PATTERN.test(item.latestDiagnosticCode)))
  );
}
