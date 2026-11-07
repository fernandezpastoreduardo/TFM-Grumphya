import { useEffect, useState, type KeyboardEvent } from "react";
import { authenticatedFetch } from "../../infrastructure/auth/session";
import { AdminContactMessageReply } from "./admin-contact-message-reply";
import type { AdminContactMessage } from "./admin-dashboard.models";
import { AdminErrorDetail } from "./components/admin-error-detail";
import { getApplicationErrorLabel } from "./application-error-labels";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import "./admin-dashboard.scss";

type DashboardData = {
  revenue: { weeklyEur: number; totalEur: number };
  maximumMonthlyCost: {
    iluminado: MaximumPlanCost;
    falton: MaximumPlanCost;
    dailyAttempts: number;
    assumedDaysPerMonth: number;
  };
  weeklyActivePlans: ActivePlanWeek[];
  annualFinance: {
    year: number;
    hostingMonthlyEur: number;
    hostingStartsMonth: string;
    usdToEurRate: number;
    exchangeRateSource: string;
    exchangeRateAsOf: string;
    months: FinanceMonth[];
  };
  estimatedAiCost: {
    weeklyUsd: number;
    totalUsd: number;
    weeklyAveragePerAccountUsd: number;
    totalAveragePerAccountUsd: number;
    activeRegisteredAccountCount: number;
    activeAdminAccountCount: number;
    weeklyByActor: AiCostByActor;
    totalByActor: AiCostByActor;
    weeklyTrend: AiCostTrendWeek[];
    unpricedUsageEvents: number;
  };
  recentAiActivity: RecentAiActivity[];
  loginSecurity: LoginSecurityMetrics;
  errors: Array<{
    latestEventId: string;
    code: string;
    weeklyCount: number;
    totalCount: number;
    lastOccurredAt: string;
    latestDiagnosticCode: string | null;
  }>;
};
type AnalyticsPage =
  | "home"
  | "precios"
  | "buenas-practicas"
  | "humanos-notables"
  | "lo-peor-de-lo-peor"
  | "contacto"
  | "descargate"
  | "other_public_pages";
type AnonymousAnalyticsData = {
  viewsByPage: Array<{ page: AnalyticsPage; count: number }>;
  deviceShares: Array<{ device: "mobile" | "desktop"; percentage: number }>;
  monthlyPlanSelections: Array<{
    month: string;
    plan: "ILUMINADO" | "FALTON";
    count: number;
  }>;
  monthlyPlanActivations: Array<{
    month: string;
    plan: "ILUMINADO" | "FALTON";
    count: number;
  }>;
};
type RecentAiActivity = {
  hour: string;
  operation: "idea_evaluation" | "roast";
  model: string;
  eventCount: number;
  inputTokenBucket: TokenVolumeBucket;
  cachedInputTokenBucket: TokenVolumeBucket;
  outputTokenBucket: TokenVolumeBucket;
  estimatedCostUsd: number | null;
};
type TokenVolumeBucket = "under_1k" | "1k_5k" | "5k_20k" | "20k_plus";
type LoginSecurityMetrics = {
  windowMinutes: 15;
  loginRequests: number;
  challengesIssued: number;
  challengesAccepted: number;
  challengesRejected: number;
  failedLogins: number;
  blockedRequests: number;
  activeBlockedAddresses: number;
  attackModeActive: boolean;
};
type MaximumPlanCost = {
  averagePerAttemptUsd: number | null;
  monthlyMaximumUsd: number | null;
  pricedAttempts: number;
};
type ActivePlanWeek = {
  weekStart: string;
  iluminado: number;
  falton: number;
};
type FinanceMonth = {
  month: string;
  revenueEur: number;
  aiCostUsd: number;
  aiCostEur: number;
  hostingEur: number;
  expensesEur: number;
  netEur: number;
};
type AiCostByActor = {
  registeredUsersUsd: number;
  adminsUsd: number;
  anonymousUsd: number;
};
type AiCostTrendWeek = AiCostByActor & { weekStart: string; totalUsd: number };
type DashboardState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      data: DashboardData;
      messages: AdminContactMessage[];
      anonymousAnalytics: AnonymousAnalyticsData;
    };

const DASHBOARD_ERROR = "No se han podido consultar los datos del panel.";
const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});
const EUR_COST = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 4,
});
const EUR_PER_ATTEMPT = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 4,
  maximumFractionDigits: 8,
});
const EUR_WHOLE = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const DECIMAL_FOUR = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 4,
});
const DATE = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});
const WEEK_LABEL = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const MONTH_LABEL = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  timeZone: "UTC",
});
const MONTH_YEAR_LABEL = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const REFERENCE_DATE_LABEL = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const BCE_EXCHANGE_RATES_URL =
  "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
const DASHBOARD_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/u;
const DIAGNOSTIC_CODE_PATTERN = /^[a-z][a-z0-9_]{0,99}$/u;
const ERROR_EVENT_ID_PATTERN = /^[1-9]\d{0,18}$/u;
const ADMIN_TABS = [
  { id: "summary", label: "Resumen" },
  { id: "benchmark", label: "Benchmark de IA" },
  { id: "telemetry", label: "Telemetría de IA" },
  { id: "security", label: "Seguridad y acceso" },
  { id: "anonymous", label: "Analítica anónima" },
] as const;
type AdminTab = (typeof ADMIN_TABS)[number]["id"];

function getNextTabIndex(currentIndex: number, key: string): number | null {
  if (key === "ArrowRight") return (currentIndex + 1) % ADMIN_TABS.length;
  if (key === "ArrowLeft")
    return (currentIndex - 1 + ADMIN_TABS.length) % ADMIN_TABS.length;
  if (key === "Home") return 0;
  if (key === "End") return ADMIN_TABS.length - 1;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function isNullableCount(value: unknown): value is number | null {
  return value === null || isCount(value);
}
function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}
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
function isRecentAiActivity(value: unknown): value is RecentAiActivity {
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
function isAnonymousAnalyticsData(
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
function isLoginSecurityMetrics(value: unknown): value is LoginSecurityMetrics {
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
function hasUniqueRecentAiActivity(activities: RecentAiActivity[]): boolean {
  const groupKeys = activities.map(
    ({ hour, operation, model }) => `${hour}\u0000${operation}\u0000${model}`,
  );
  return new Set(groupKeys).size === groupKeys.length;
}
function getAiOperationLabel(operation: RecentAiActivity["operation"]): string {
  if (operation === "idea_evaluation") return "Evaluación de idea";
  return "Envío de roast";
}
function getTokenVolumeLabel(bucket: TokenVolumeBucket): string {
  if (bucket === "under_1k") return "Menos de 1.000";
  if (bucket === "1k_5k") return "1.000–4.999";
  if (bucket === "5k_20k") return "5.000–19.999";
  return "20.000 o más";
}
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
function isDashboardData(value: unknown): value is DashboardData {
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
function isContact(value: unknown): value is AdminContactMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.subject === "string" &&
    typeof value.message === "string" &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    isRecord(value.sender) &&
    typeof value.sender.username === "string" &&
    typeof value.sender.email === "string" &&
    isRecord(value.reply) &&
    isReplyStatus(value.reply.status) &&
    (value.reply.attemptedAt === null ||
      (typeof value.reply.attemptedAt === "string" &&
        Number.isFinite(Date.parse(value.reply.attemptedAt)))) &&
    typeof value.reply.retryAllowed === "boolean"
  );
}
function isReplyStatus(
  value: unknown,
): value is AdminContactMessage["reply"]["status"] {
  return (
    value === "not_replied" ||
    value === "sending" ||
    value === "sent" ||
    value === "previewed" ||
    value === "uncertain"
  );
}

export function AdminDashboard() {
  const errorEventId = new URLSearchParams(window.location.search).get("error");
  if (errorEventId !== null) {
    return <AdminErrorDetail eventId={errorEventId} />;
  }
  return <AdminDashboardOverview />;
}

function AdminDashboardOverview() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [activeTab, setActiveTab] = useState<AdminTab>("summary");
  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    const nextIndex = getNextTabIndex(currentIndex, event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = ADMIN_TABS[nextIndex];
    setActiveTab(nextTab.id);
    const tabButtons =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
    tabButtons?.[nextIndex]?.focus();
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      authenticatedFetch("/api/admin/dashboard"),
      authenticatedFetch("/api/admin/contact-messages"),
      authenticatedFetch("/api/admin/anonymous-analytics"),
    ])
      .then(
        async ([dashboardResponse, contactsResponse, analyticsResponse]) => {
          const [dashboardBody, contactsBody, analyticsBody]: [
            unknown,
            unknown,
            unknown,
          ] = await Promise.all([
            dashboardResponse.json(),
            contactsResponse.json(),
            analyticsResponse.json(),
          ]);
          if (!active) return;
          if (
            !dashboardResponse.ok ||
            !contactsResponse.ok ||
            !analyticsResponse.ok ||
            !isDashboardData(dashboardBody) ||
            !isAnonymousAnalyticsData(analyticsBody) ||
            !isRecord(contactsBody) ||
            !Array.isArray(contactsBody.messages) ||
            !contactsBody.messages.every(isContact)
          ) {
            setState({ status: "error" });
            return;
          }
          setState({
            status: "ready",
            data: dashboardBody,
            messages: contactsBody.messages,
            anonymousAnalytics: analyticsBody,
          });
        },
      )
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading")
    return (
      <LoadingSkeleton
        label="Cargando el panel de administración"
        className="admin-dashboard-skeleton"
      >
        <div className="admin-dashboard-skeleton-heading">
          <SkeletonBlock className="skeleton-admin-eyebrow" />
          <SkeletonBlock className="skeleton-admin-title" />
          <SkeletonBlock className="skeleton-admin-copy" />
        </div>
        <div className="admin-metrics">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="admin-metric admin-metric-skeleton" key={index}>
              <SkeletonBlock className="skeleton-admin-label" />
              <SkeletonBlock className="skeleton-admin-value" />
            </div>
          ))}
        </div>
        <div className="admin-dashboard-card admin-table-skeleton">
          <SkeletonBlock className="skeleton-admin-title" />
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock className="skeleton-admin-table-row" key={index} />
          ))}
        </div>
        <div className="admin-dashboard-card admin-contacts-skeleton">
          <SkeletonBlock className="skeleton-admin-title" />
          {Array.from({ length: 2 }, (_, index) => (
            <SkeletonBlock className="skeleton-admin-contact" key={index} />
          ))}
        </div>
      </LoadingSkeleton>
    );
  if (state.status === "error")
    return (
      <section className="admin-dashboard-error" role="alert">
        <h2>Panel no disponible</h2>
        <p>{DASHBOARD_ERROR}</p>
      </section>
    );

  const { data } = state;
  return (
    <div className="admin-dashboard">
      <section
        className="admin-dashboard-heading"
        aria-labelledby="admin-dashboard-title"
      >
        <span className="eyebrow">Zona de administración</span>
        <h2 id="admin-dashboard-title">Hola, Jappy.</h2>
        <p>
          Los ingresos son simulados. El coste de IA es una estimación basada en
          tokens registrados.
        </p>
      </section>
      <div
        className="admin-dashboard-tabs"
        role="tablist"
        aria-label="Secciones del panel"
      >
        {ADMIN_TABS.map((tab, index) => (
          <button
            aria-controls={`admin-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            id={`admin-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section
        aria-labelledby={`admin-tab-${activeTab}`}
        className="admin-dashboard-tabpanel"
        id={`admin-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
      >
        {activeTab === "summary" ? (
          <>
            <section
              className="admin-metrics"
              aria-label="Ingresos simulados y costes estimados"
            >
              <Metric
                title="Ingresos simulados · esta semana"
                value={EUR.format(data.revenue.weeklyEur)}
              />
              <Metric
                title="Ingresos simulados · total"
                value={EUR.format(data.revenue.totalEur)}
              />
              <Metric
                title="Coste IA estimado · esta semana"
                value={EUR_COST.format(
                  data.estimatedAiCost.weeklyUsd *
                    data.annualFinance.usdToEurRate,
                )}
              />
              <Metric
                title="Coste IA estimado · total"
                value={EUR_COST.format(
                  data.estimatedAiCost.totalUsd *
                    data.annualFinance.usdToEurRate,
                )}
              />
              <Metric
                title="Coste medio estimado por cuenta · semana"
                value={EUR_COST.format(
                  data.estimatedAiCost.weeklyAveragePerAccountUsd *
                    data.annualFinance.usdToEurRate,
                )}
              />
              <Metric
                title="Coste medio estimado por cuenta · total"
                value={EUR_COST.format(
                  data.estimatedAiCost.totalAveragePerAccountUsd *
                    data.annualFinance.usdToEurRate,
                )}
              />
              <MaximumCostMetric
                title="Coste máximo iluminado"
                cost={data.maximumMonthlyCost.iluminado}
                usdToEurRate={data.annualFinance.usdToEurRate}
              />
              <MaximumCostMetric
                title="Coste máximo faltón"
                cost={data.maximumMonthlyCost.falton}
                usdToEurRate={data.annualFinance.usdToEurRate}
              />
            </section>
            <p className="admin-dashboard-note admin-maximum-cost-note">
              Máximo estimado por cuenta: coste medio de entrada y salida de
              cada operación con precio ×{" "}
              {data.maximumMonthlyCost.dailyAttempts} intentos al día ×{" "}
              {data.maximumMonthlyCost.assumedDaysPerMonth} días de media al
              mes. Solo se cuentan evaluaciones de ideas para Iluminado y
              mensajes de roast para Faltón; otras operaciones de IA quedan
              fuera de este cálculo.
            </p>
            <p className="admin-dashboard-note admin-ai-cost-note">
              El coste medio por cuenta incluye a usuarios registrados y admins
              activos ({data.estimatedAiCost.activeRegisteredAccountCount} y{" "}
              {data.estimatedAiCost.activeAdminAccountCount}, respectivamente).
              Los usos sin cuenta también forman parte del gasto total y se
              muestran aparte. Eventos sin precio configurado:{" "}
              {data.estimatedAiCost.unpricedUsageEvents}. Los eventos anteriores
              a registrar tokens cacheados no se pueden recalcular con
              exactitud; el total es una estimación de uso, no la factura de
              OpenAI.
            </p>
            <section
              className="admin-dashboard-card admin-ai-costs"
              aria-labelledby="admin-ai-costs-title"
            >
              <div className="admin-dashboard-section-heading">
                <div>
                  <span className="eyebrow">Costes estimados de IA · EUR</span>
                  <h2 id="admin-ai-costs-title">Quién genera el coste</h2>
                </div>
              </div>
              <CostBreakdown
                title="Esta semana"
                costs={data.estimatedAiCost.weeklyByActor}
                usdToEurRate={data.annualFinance.usdToEurRate}
              />
              <CostBreakdown
                title="Acumulado"
                costs={data.estimatedAiCost.totalByActor}
                usdToEurRate={data.annualFinance.usdToEurRate}
              />
              <div className="admin-chart-pair">
                <ActivePlansChart weeks={data.weeklyActivePlans} />
                <AiCostChart
                  weeks={data.estimatedAiCost.weeklyTrend}
                  usdToEurRate={data.annualFinance.usdToEurRate}
                />
              </div>
            </section>
            <AnnualFinanceChart finance={data.annualFinance} />
            <section
              className="admin-dashboard-card"
              aria-labelledby="admin-errors-title"
            >
              <h2 id="admin-errors-title">Errores más registrados</h2>
              {data.errors.length ? (
                <div className="admin-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Error y diagnóstico</th>
                        <th scope="col">Esta semana</th>
                        <th scope="col">Total</th>
                        <th scope="col">Última vez</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.errors.map((error) => (
                        <tr
                          key={`${error.code}:${error.latestDiagnosticCode ?? "none"}`}
                        >
                          <th scope="row">
                            <a
                              href={`/panel-control?error=${encodeURIComponent(error.latestEventId)}`}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              {getApplicationErrorLabel(
                                error.code,
                                error.latestDiagnosticCode,
                              )}
                            </a>
                            {error.latestDiagnosticCode && (
                              <div>
                                <code>{error.latestDiagnosticCode}</code>
                              </div>
                            )}
                          </th>
                          <td>{error.weeklyCount}</td>
                          <td>{error.totalCount}</td>
                          <td>
                            <time dateTime={error.lastOccurredAt}>
                              {DATE.format(new Date(error.lastOccurredAt))}
                            </time>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No hay errores registrados.</p>
              )}
            </section>
            <section
              className="admin-dashboard-card"
              aria-labelledby="admin-contacts-title"
            >
              <div className="admin-dashboard-section-heading">
                <div>
                  <span className="eyebrow">Bandeja de entrada</span>
                  <h2 id="admin-contacts-title">Mensajes de contacto</h2>
                </div>
                <span>{state.messages.length}</span>
              </div>
              {state.messages.length ? (
                <div className="admin-contact-list">
                  {state.messages.map((contact) => (
                    <article className="admin-contact" key={contact.id}>
                      <div className="admin-contact-heading">
                        <div>
                          <h3>{contact.subject}</h3>
                          <p>
                            {contact.sender.username} ·{" "}
                            <a
                              href={`mailto:${encodeURIComponent(contact.sender.email)}`}
                            >
                              {contact.sender.email}
                            </a>
                          </p>
                        </div>
                        <time dateTime={contact.createdAt}>
                          {DATE.format(new Date(contact.createdAt))}
                        </time>
                      </div>
                      <p className="admin-contact-message">{contact.message}</p>
                      <AdminContactMessageReply contact={contact} />
                    </article>
                  ))}
                </div>
              ) : (
                <p>Aún no han llegado mensajes.</p>
              )}
              <p className="admin-dashboard-note">
                Se muestran los 100 mensajes más recientes. Las respuestas se
                envían desde el buzón de IONOS; las respuestas recibidas se
                consultan en el webmail y no se leen desde esta aplicación. Si
                un envío queda sin confirmar, revisa el webmail antes de
                autorizar un reintento.
              </p>
            </section>
          </>
        ) : null}
        {activeTab === "benchmark" ? <BenchmarkTab /> : null}
        {activeTab === "telemetry" ? <TelemetryTab data={data} /> : null}
        {activeTab === "security" ? <SecurityTab data={data} /> : null}
        {activeTab === "anonymous" ? (
          <AnonymousAnalyticsTab data={state.anonymousAnalytics} />
        ) : null}
      </section>
    </div>
  );
}

const ANALYTICS_PAGE_LABELS: Readonly<Record<AnalyticsPage, string>> = {
  home: "Inicio",
  precios: "Planes",
  "buenas-practicas": "Buenas prácticas",
  "humanos-notables": "Humanos notables",
  "lo-peor-de-lo-peor": "El muro de la vergüenza",
  contacto: "Contacto",
  descargate: "Descárgate",
  other_public_pages: "Otras secciones",
};
const ANALYTICS_PLAN_LABELS = {
  ILUMINADO: "Iluminado",
  FALTON: "Faltón",
} as const;
const ANALYTICS_MONTH = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

function AnonymousAnalyticsTab({ data }: { data: AnonymousAnalyticsData }) {
  const completeDeviceBreakdown = data.deviceShares.length === 2;
  return (
    <section
      className="admin-analytics"
      aria-labelledby="admin-analytics-title"
    >
      <header className="admin-dashboard-card">
        <span className="eyebrow">
          Sin visitas únicas. Sin perseguir a nadie.
        </span>
        <h2 id="admin-analytics-title">Analítica anónima</h2>
        <p>
          Recuentos propios por periodo y categoría. Una recarga vuelve a
          contar; estos números describen actividad, no personas ni sesiones.
        </p>
      </header>
      <section
        className="admin-dashboard-card"
        aria-labelledby="admin-views-title"
      >
        <h2 id="admin-views-title">
          Páginas públicas más vistas · últimos 30 días cerrados
        </h2>
        <AnalyticsBarList
          empty="Todavía no hay categorías con diez vistas o más."
          entries={data.viewsByPage.map((entry) => ({
            label: ANALYTICS_PAGE_LABELS[entry.page],
            count: entry.count,
          }))}
        />
      </section>
      <div className="admin-analytics-grid">
        <section
          className="admin-dashboard-card"
          aria-labelledby="admin-device-title"
        >
          <h2 id="admin-device-title">
            Tamaño de pantalla · últimos 30 días cerrados
          </h2>
          {completeDeviceBreakdown ? (
            <AnalyticsBarList
              entries={data.deviceShares.map((entry) => ({
                label:
                  entry.device === "mobile"
                    ? "Móvil · estrecha"
                    : "Escritorio · amplia",
                count: entry.percentage,
                suffix: `${entry.percentage} %`,
              }))}
            />
          ) : (
            <p>
              No se muestra el reparto hasta que ambas categorías alcancen diez
              vistas.
            </p>
          )}
          <p className="admin-dashboard-note">
            Es una estimación basada en el ancho de ventana, no en la identidad
            ni el modelo del dispositivo.
          </p>
        </section>
        <section
          className="admin-dashboard-card"
          aria-labelledby="admin-plans-title"
        >
          <h2 id="admin-plans-title">
            Interés en los planes · últimos 6 meses cerrados
          </h2>
          <p>Selecciones y activaciones simuladas agregadas por mes y plan.</p>
          <AnalyticsPlanMonths
            selections={data.monthlyPlanSelections}
            activations={data.monthlyPlanActivations}
          />
          <p className="admin-dashboard-note">
            No se enlaza una vista con una selección o activación. Son recuentos
            paralelos, no una tasa individual de conversión.
          </p>
        </section>
      </div>
      <p className="admin-dashboard-note">
        Solo se guardan contadores diarios. No se guardan IP, cookies, agente de
        navegador, URL completa, cuenta, identificador de visita ni texto
        enviado. Las páginas de poco tráfico se agrupan; los grupos de plan con
        menos de diez eventos se omiten. Los datos se eliminan tras trece meses.
      </p>
    </section>
  );
}

function AnalyticsBarList({
  entries,
  empty = "No hay suficientes datos para mostrar estas categorías.",
}: {
  entries: Array<{ label: string; count: number; suffix?: string }>;
  empty?: string;
}) {
  if (!entries.length) return <p>{empty}</p>;
  const maximum = Math.max(...entries.map((entry) => entry.count));
  return (
    <ul className="admin-analytics-bar-list">
      {entries.map((entry) => (
        <li key={entry.label}>
          <span>{entry.label}</span>
          <span className="admin-analytics-bar-track" aria-hidden="true">
            <span
              className="admin-analytics-bar"
              style={{
                width: `${Math.max(4, (entry.count / maximum) * 100)}%`,
              }}
            />
          </span>
          <strong>{entry.suffix ?? entry.count}</strong>
        </li>
      ))}
    </ul>
  );
}

function AnalyticsPlanMonths({
  selections,
  activations,
}: {
  selections: AnonymousAnalyticsData["monthlyPlanSelections"];
  activations: AnonymousAnalyticsData["monthlyPlanActivations"];
}) {
  const months = [
    ...new Set([
      ...selections.map((entry) => entry.month),
      ...activations.map((entry) => entry.month),
    ]),
  ].sort((left, right) => left.localeCompare(right, "es-ES"));
  if (!months.length)
    return <p>Aún no hay grupos mensuales con diez eventos.</p>;
  return (
    <div className="admin-table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Plan</th>
            <th scope="col">Clics en «Elegir»</th>
            <th scope="col">Activaciones simuladas</th>
          </tr>
        </thead>
        <tbody>
          {months.flatMap((month) =>
            (["ILUMINADO", "FALTON"] as const).map((plan) => {
              const chosen = selections.find(
                (entry) => entry.month === month && entry.plan === plan,
              );
              const activated = activations.find(
                (entry) => entry.month === month && entry.plan === plan,
              );
              if (!chosen && !activated) return null;
              return (
                <tr key={`${month}:${plan}`}>
                  <th scope="row">
                    {ANALYTICS_MONTH.format(new Date(`${month}-01T12:00:00Z`))}
                  </th>
                  <td>{ANALYTICS_PLAN_LABELS[plan]}</td>
                  <td>{chosen?.count ?? "No mostrado"}</td>
                  <td>{activated?.count ?? "No mostrado"}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

function BenchmarkTab() {
  return (
    <section
      className="admin-dashboard-card"
      aria-labelledby="admin-benchmark-title"
    >
      <h2 id="admin-benchmark-title">Benchmark de evaluaciones y prompts</h2>
      <p>
        Compara versiones de instrucciones y modelos con seis casos sintéticos
        etiquetados, incluidos intentos de inyección de instrucciones. No
        utiliza ideas enviadas por usuarios.
      </p>
      <ul>
        <li>Compara el acuerdo con las decisiones esperadas por caso.</li>
        <li>Compara la consistencia de estado y motivo entre variantes.</li>
        <li>
          Las salidas del benchmark contienen métricas agregadas, nunca el texto
          de los casos.
        </li>
      </ul>
      <p>No hay ningún informe de benchmark guardado en este momento.</p>
      <p>El informe sintético incluiría:</p>
      <ul>
        <li>Versión de la política y fecha de generación.</li>
        <li>Número de casos y variantes evaluadas.</li>
        <li>
          Acuerdo con las decisiones esperadas, en recuento y porcentaje, por
          variante.
        </li>
        <li>
          Recuento de casos con acuerdo de estado y de motivo entre variantes.
        </li>
        <li>Confirmación de que solo se emiten resultados agregados.</li>
      </ul>
      <p className="admin-dashboard-note">
        No se ha ejecutado un benchmark desde este panel. El informe no incluye
        ideas ni explicaciones de los modelos.
      </p>
    </section>
  );
}

function TelemetryTab({ data }: { data: DashboardData }) {
  return (
    <section
      className="admin-dashboard-card"
      aria-labelledby="admin-telemetry-title"
    >
      <h2 id="admin-telemetry-title">Telemetría de operaciones de IA</h2>
      <p>
        Actividad agregada de las últimas 24 horas, agrupada por hora, operación
        y modelo. El coste estimado se convierte a euros con la referencia del
        BCE indicada en finanzas.
      </p>
      <div className="admin-metrics">
        <Metric
          title="Coste estimado · esta semana"
          value={EUR_COST.format(
            data.estimatedAiCost.weeklyUsd * data.annualFinance.usdToEurRate,
          )}
        />
        <Metric
          title="Coste estimado · total"
          value={EUR_COST.format(
            data.estimatedAiCost.totalUsd * data.annualFinance.usdToEurRate,
          )}
        />
        <Metric
          title="Eventos sin precio configurado"
          value={String(data.estimatedAiCost.unpricedUsageEvents)}
        />
      </div>
      <section aria-labelledby="admin-recent-ai-activity-title">
        <h3 id="admin-recent-ai-activity-title">Actividad reciente de IA</h3>
        {data.recentAiActivity.length > 0 ? (
          <div className="admin-table-scroll">
            <table aria-label="Actividad reciente agregada de IA">
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Operación</th>
                  <th scope="col">Modelo</th>
                  <th scope="col">Usos</th>
                  <th scope="col">Volumen de entrada</th>
                  <th scope="col">Volumen cacheado</th>
                  <th scope="col">Volumen de salida</th>
                  <th scope="col">Coste estimado</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAiActivity.map((activity) => (
                  <tr
                    key={`${activity.hour}:${activity.operation}:${activity.model}`}
                  >
                    <td>
                      <time dateTime={activity.hour}>
                        {DATE.format(new Date(activity.hour))}
                      </time>
                    </td>
                    <td>{getAiOperationLabel(activity.operation)}</td>
                    <td>{activity.model}</td>
                    <td>{activity.eventCount}</td>
                    <td>{getTokenVolumeLabel(activity.inputTokenBucket)}</td>
                    <td>
                      {getTokenVolumeLabel(activity.cachedInputTokenBucket)}
                    </td>
                    <td>{getTokenVolumeLabel(activity.outputTokenBucket)}</td>
                    <td>
                      {activity.estimatedCostUsd === null
                        ? "Sin precio configurado"
                        : EUR_COST.format(
                            activity.estimatedCostUsd *
                              data.annualFinance.usdToEurRate,
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No hay grupos de tres o más usos en las últimas 24 horas.</p>
        )}
      </section>
      <p className="admin-dashboard-note">
        Solo se muestran grupos de tres o más usos y el volumen de tokens en
        rangos. No aparecen ideas, cuentas, direcciones IP, sesiones ni
        identificadores individuales.
      </p>
    </section>
  );
}

function SecurityTab({ data }: { data: DashboardData }) {
  const metrics = data.loginSecurity;
  return (
    <section
      className="admin-dashboard-card"
      aria-labelledby="admin-security-title"
    >
      <h2 id="admin-security-title">Actividad de acceso y protección</h2>
      <p>Métricas agregadas de los últimos {metrics.windowMinutes} minutos.</p>
      <div className="admin-metrics" aria-label="Métricas agregadas de acceso">
        <Metric
          title="Solicitudes de acceso"
          value={String(metrics.loginRequests)}
        />
        <Metric
          title="Desafíos emitidos"
          value={String(metrics.challengesIssued)}
        />
        <Metric
          title="Desafíos aceptados"
          value={String(metrics.challengesAccepted)}
        />
        <Metric
          title="Desafíos rechazados"
          value={String(metrics.challengesRejected)}
        />
        <Metric
          title="Inicios de sesión fallidos"
          value={String(metrics.failedLogins)}
        />
        <Metric
          title="Solicitudes bloqueadas"
          value={String(metrics.blockedRequests)}
        />
        <Metric
          title="Direcciones bloqueadas activas"
          value={String(metrics.activeBlockedAddresses)}
        />
        <Metric
          title="Modo de ataque"
          value={metrics.attackModeActive ? "Activo" : "Inactivo"}
        />
      </div>
      <p className="admin-dashboard-note">
        Contadores volátiles en memoria; se reinician al reiniciarse el proceso.
        Son agregados y no muestran direcciones IP, cuentas ni sesiones, ni
        conservan un historial individual de inicios de sesión.
      </p>
      <h3>Pruebas de seguridad cubiertas</h3>
      <ul>
        <li>
          Inyección de instrucciones dentro de ideas y descripciones no
          confiables.
        </li>
        <li>
          Cuotas anónimas y de planes, con límites aplicados en el servidor.
        </li>
        <li>
          Aislamiento entre cuentas y acceso al panel protegido por rol admin.
        </li>
        <li>
          Pruebas PostgreSQL de integración con esquemas temporales; E2E con
          repositorios en memoria y servicios locales aislados.
        </li>
      </ul>
      <p>
        La suite automatizada se ejecuta en CI junto con auditoría de
        dependencias y análisis de la imagen de contenedor.
      </p>
      <p className="admin-dashboard-note">
        Consulta los documentos <code>doc/ci-cd.md</code> y{" "}
        <code>doc/ai-evaluation-and-observability.md</code> para comandos,
        alcance y limitaciones.
      </p>
    </section>
  );
}

function CostBreakdown({
  title,
  costs,
  usdToEurRate,
}: {
  title: string;
  costs: AiCostByActor;
  usdToEurRate: number;
}) {
  return (
    <div className="admin-cost-breakdown">
      <h3>{title}</h3>
      <dl>
        <div>
          <dt>Cuentas de usuario</dt>
          <dd>{EUR_COST.format(costs.registeredUsersUsd * usdToEurRate)}</dd>
        </div>
        <div>
          <dt>Jappy · admin</dt>
          <dd>{EUR_COST.format(costs.adminsUsd * usdToEurRate)}</dd>
        </div>
        <div>
          <dt>Visitantes sin cuenta</dt>
          <dd>{EUR_COST.format(costs.anonymousUsd * usdToEurRate)}</dd>
        </div>
      </dl>
    </div>
  );
}

const CHART = {
  width: 720,
  height: 230,
  top: 14,
  bottom: 42,
  left: 36,
  right: 12,
};
const CHART_COLORS = {
  registeredUsers: "#087f8c",
  admins: "#e89b22",
  anonymous: "#d94d7b",
} as const;

function AiCostChart({
  weeks,
  usdToEurRate,
}: {
  weeks: AiCostTrendWeek[];
  usdToEurRate: number;
}) {
  const chartHeight = CHART.height - CHART.top - CHART.bottom;
  const maxCost = Math.max(...weeks.map((week) => week.totalUsd), 0.000001);
  const slotWidth =
    (CHART.width - CHART.left - CHART.right) / Math.max(weeks.length, 1);
  const barWidth = Math.min(48, slotWidth * 0.58);
  return (
    <figure className="admin-ai-cost-chart">
      <figcaption>¿Quién genera el gasto? · últimas 8 semanas</figcaption>
      <div className="admin-ai-cost-legend" aria-hidden="true">
        <span>
          <i className="registered" />
          Cuentas de usuario
        </span>
        <span>
          <i className="admin" />
          Jappy · admin
        </span>
        <span>
          <i className="anonymous" />
          Visitantes sin cuenta
        </span>
      </div>
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label="Gráfico de barras apiladas del coste semanal de IA durante las últimas ocho semanas"
      >
        <line
          x1={CHART.left}
          x2={CHART.width - CHART.right}
          y1={CHART.top + chartHeight}
          y2={CHART.top + chartHeight}
          className="admin-chart-axis"
        />
        {weeks.map((week, index) => {
          const x = CHART.left + index * slotWidth + (slotWidth - barWidth) / 2;
          let y = CHART.top + chartHeight;
          const segments = [
            {
              value: week.registeredUsersUsd,
              color: CHART_COLORS.registeredUsers,
            },
            { value: week.adminsUsd, color: CHART_COLORS.admins },
            { value: week.anonymousUsd, color: CHART_COLORS.anonymous },
          ];
          const bars = segments.map((segment) => {
            const height = (segment.value / maxCost) * chartHeight;
            y -= height;
            return (
              <rect
                key={segment.color}
                x={x}
                y={y}
                width={barWidth}
                height={height}
                fill={segment.color}
                rx="3"
              />
            );
          });
          return (
            <g key={week.weekStart}>
              <title>{`${week.weekStart}: ${EUR_COST.format(week.totalUsd * usdToEurRate)} en total; cuentas ${EUR_COST.format(week.registeredUsersUsd * usdToEurRate)}, Jappy ${EUR_COST.format(week.adminsUsd * usdToEurRate)}, visitantes ${EUR_COST.format(week.anonymousUsd * usdToEurRate)}`}</title>
              {bars}
              <text
                x={x + barWidth / 2}
                y={CHART.height - 13}
                textAnchor="middle"
              >
                {WEEK_LABEL.format(new Date(`${week.weekStart}T12:00:00Z`))}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function MaximumCostMetric({
  title,
  cost,
  usdToEurRate,
}: {
  title: string;
  cost: MaximumPlanCost;
  usdToEurRate: number;
}) {
  return (
    <article className="admin-metric admin-maximum-cost">
      <h3>{title}</h3>
      <p>
        {cost.monthlyMaximumUsd === null
          ? "Sin usos con precio registrado"
          : EUR_COST.format(cost.monthlyMaximumUsd * usdToEurRate)}
      </p>
      <small>
        {cost.pricedAttempts} usos con precio · media por intento:{" "}
        {cost.averagePerAttemptUsd === null
          ? "sin datos"
          : EUR_PER_ATTEMPT.format(cost.averagePerAttemptUsd * usdToEurRate)}
      </small>
    </article>
  );
}

function ActivePlansChart({ weeks }: { weeks: ActivePlanWeek[] }) {
  const chartHeight = CHART.height - CHART.top - CHART.bottom;
  const maxUsers = Math.max(
    ...weeks.map((week) => Math.max(week.iluminado, week.falton)),
    1,
  );
  const slotWidth =
    (CHART.width - CHART.left - CHART.right) / Math.max(weeks.length, 1);
  const barWidth = Math.min(24, slotWidth * 0.3);
  return (
    <figure className="admin-ai-cost-chart admin-active-plans-chart">
      <figcaption>Usuarios activos por plan · últimas 8 semanas</figcaption>
      <div className="admin-ai-cost-legend" aria-hidden="true">
        <span>
          <i className="iluminado" />
          Iluminado
        </span>
        <span>
          <i className="falton" />
          Faltón
        </span>
      </div>
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label="Usuarios activos por plan y semana durante las últimas ocho semanas"
      >
        <line
          x1={CHART.left}
          x2={CHART.width - CHART.right}
          y1={CHART.top + chartHeight}
          y2={CHART.top + chartHeight}
          className="admin-chart-axis"
        />
        {weeks.map((week, index) => {
          const center = CHART.left + index * slotWidth + slotWidth / 2;
          const iluminadoHeight = (week.iluminado / maxUsers) * chartHeight;
          const faltonHeight = (week.falton / maxUsers) * chartHeight;
          return (
            <g key={week.weekStart}>
              <title>{`${week.weekStart}: Iluminado ${week.iluminado}; Faltón ${week.falton}`}</title>
              <rect
                x={center - barWidth - 2}
                y={CHART.top + chartHeight - iluminadoHeight}
                width={barWidth}
                height={iluminadoHeight}
                fill="#087f8c"
                rx="3"
              />
              <rect
                x={center + 2}
                y={CHART.top + chartHeight - faltonHeight}
                width={barWidth}
                height={faltonHeight}
                fill="#d94d7b"
                rx="3"
              />
              <text x={center} y={CHART.height - 13} textAnchor="middle">
                {WEEK_LABEL.format(new Date(`${week.weekStart}T12:00:00Z`))}
              </text>
            </g>
          );
        })}
      </svg>
      <details className="admin-chart-details">
        <summary>Ver cifras por semana</summary>
        <div className="admin-table-scroll">
          <table>
            <caption>Datos semanales por plan</caption>
            <thead>
              <tr>
                <th scope="col">Semana de</th>
                <th scope="col">Iluminado</th>
                <th scope="col">Faltón</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.weekStart}>
                  <th scope="row">{week.weekStart}</th>
                  <td>{week.iluminado}</td>
                  <td>{week.falton}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="admin-dashboard-note">
        Se cuenta cada usuario con una suscripción vigente en algún momento de
        la semana, aunque no haya usado el plan.
      </p>
    </figure>
  );
}

function AnnualFinanceChart({
  finance,
}: {
  finance: DashboardData["annualFinance"];
}) {
  const { months } = finance;
  const netCents = Math.round(
    months.reduce((sum, month) => sum + month.netEur, 0) * 100,
  );
  const net = netCents === 0 ? 0 : netCents / 100;
  const chartHeight = CHART.height - CHART.top - CHART.bottom;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const maxAmount = Math.max(
    ...months.flatMap((month) => [month.revenueEur, month.expensesEur]),
    1,
  );
  const xFor = (index: number) =>
    CHART.left + ((index + 0.5) * plotWidth) / Math.max(months.length, 1);
  const yFor = (amount: number) =>
    CHART.top + chartHeight - (amount / maxAmount) * chartHeight;
  const incomePoints = months
    .map((month, index) => `${xFor(index)},${yFor(month.revenueEur)}`)
    .join(" ");
  const expensePoints = months
    .map((month, index) => `${xFor(index)},${yFor(month.expensesEur)}`)
    .join(" ");
  return (
    <section
      className="admin-dashboard-card admin-annual-finance"
      aria-labelledby="admin-annual-finance-title"
    >
      <span className="eyebrow">Balance anual · EUR</span>
      <h2 id="admin-annual-finance-title">
        Ingresos y gastos · {finance.year}
      </h2>
      <p className="admin-annual-net">
        Resultado acumulado hasta hoy: <strong>{EUR.format(net)}</strong>
      </p>
      <figure className="admin-ai-cost-chart">
        <figcaption>Ingresos simulados frente a gastos por mes</figcaption>
        <div className="admin-ai-cost-legend" aria-hidden="true">
          <span>
            <i className="income" />
            Ingresos simulados
          </span>
          <span>
            <i className="expenses" />
            Gastos estimados
          </span>
        </div>
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label={`Ingresos y gastos por mes de ${finance.year} hasta la fecha actual`}
        >
          <line
            x1={CHART.left}
            x2={CHART.width - CHART.right}
            y1={CHART.top + chartHeight}
            y2={CHART.top + chartHeight}
            className="admin-chart-axis"
          />
          <polyline
            points={incomePoints}
            fill="none"
            stroke="#087f8c"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <polyline
            points={expensePoints}
            fill="none"
            stroke="#d94d7b"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {months.map((month, index) => (
            <g key={month.month}>
              <title>{`${month.month}: ingresos simulados ${EUR.format(month.revenueEur)}; gastos estimados ${EUR.format(month.expensesEur)}; resultado ${EUR.format(month.netEur)}`}</title>
              <circle
                cx={xFor(index)}
                cy={yFor(month.revenueEur)}
                r="5"
                fill="#087f8c"
              />
              <circle
                cx={xFor(index)}
                cy={yFor(month.expensesEur)}
                r="5"
                fill="#d94d7b"
              />
              <text x={xFor(index)} y={CHART.height - 13} textAnchor="middle">
                {MONTH_LABEL.format(new Date(`${month.month}-15T12:00:00Z`))}
              </text>
            </g>
          ))}
        </svg>
      </figure>
      <details className="admin-chart-details">
        <summary>Ver cifras por mes</summary>
        <div className="admin-table-scroll">
          <table>
            <caption>Datos mensuales de ingresos y gastos</caption>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Ingresos simulados</th>
                <th scope="col">Gastos estimados</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month}>
                  <th scope="row">{month.month}</th>
                  <td>{EUR.format(month.revenueEur)}</td>
                  <td>{EUR.format(month.expensesEur)}</td>
                  <td>{EUR.format(month.netEur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="admin-annual-explanation">
        <p>
          <strong>Ingresos:</strong> pagos simulados de suscripciones
          confirmadas; no son cobros reales.
        </p>
        <p>
          <strong>Gastos:</strong> coste estimado de tokens consumidos,
          convertido de USD a EUR con la{" "}
          <a
            href={BCE_EXCHANGE_RATES_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            referencia fija del {finance.exchangeRateSource}
          </a>{" "}
          del{" "}
          {REFERENCE_DATE_LABEL.format(
            new Date(`${finance.exchangeRateAsOf}T12:00:00Z`),
          )}{" "}
          (1 USD = {DECIMAL_FOUR.format(finance.usdToEurRate)} EUR), más{" "}
          {EUR_WHOLE.format(finance.hostingMonthlyEur)} al mes de hosting desde{" "}
          {MONTH_YEAR_LABEL.format(
            new Date(`${finance.hostingStartsMonth}-15T12:00:00Z`),
          )}
          . Los eventos de IA sin precio conocido quedan fuera; es una
          estimación, no la factura del proveedor.
        </p>
      </div>
    </section>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <article className="admin-metric">
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}
