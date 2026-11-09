import type { AiUsageRecord } from "../infrastructure/ai/ai-usage";
import type { AnonymousAnalyticsSnapshot } from "../anonymous-analytics/anonymous-analytics.models";

export type AdminDashboardSnapshot = {
  recentAiActivity: Array<{
    hour: string;
    operation: "idea_evaluation" | "roast";
    model: string;
    eventCount: number;
    inputTokenBucket: TokenVolumeBucket;
    cachedInputTokenBucket: TokenVolumeBucket;
    outputTokenBucket: TokenVolumeBucket;
    estimatedCostUsd: number | null;
  }>;
  loginSecurity: {
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
  revenue: { weeklyEur: number; totalEur: number };
  maximumMonthlyCost: {
    iluminado: MaximumMonthlyPlanCost;
    falton: MaximumMonthlyPlanCost;
    dailyAttempts: 11;
    assumedDaysPerMonth: 30;
  };
  weeklyActivePlans: Array<WeeklyActivePlans>;
  annualFinance: AnnualFinance;
  estimatedAiCost: {
    weeklyUsd: number;
    totalUsd: number;
    weeklyAveragePerAccountUsd: number;
    totalAveragePerAccountUsd: number;
    activeRegisteredAccountCount: number;
    activeAdminAccountCount: number;
    weeklyByActor: AiCostByActor;
    totalByActor: AiCostByActor;
    weeklyTrend: Array<AiCostTrendWeek>;
    unpricedUsageEvents: number;
  };
  errors: Array<{
    latestEventId: string;
    code: string;
    weeklyCount: number;
    totalCount: number;
    lastOccurredAt: string;
    latestDiagnosticCode: string | null;
  }>;
};

export type LighthousePageCode = "home" | "precios" | "lo-peor-de-lo-peor";
export type LighthouseDevice = "mobile" | "desktop";
export type LighthouseQualityRun = {
  commitSha: string;
  measuredAt: string;
  page: LighthousePageCode;
  device: LighthouseDevice;
  sampleCount: 3;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  speedIndexMs: number | null;
};

export type TokenVolumeBucket = "under_1k" | "1k_5k" | "5k_20k" | "20k_plus";

export type MaximumMonthlyPlanCost = {
  averagePerAttemptUsd: number | null;
  monthlyMaximumUsd: number | null;
  pricedAttempts: number;
};

export type WeeklyActivePlans = {
  weekStart: string;
  iluminado: number;
  falton: number;
};

export type AnnualFinance = {
  year: number;
  hostingMonthlyEur: 12;
  hostingStartsMonth: "2026-10";
  usdToEurRate: number;
  exchangeRateSource: "BCE";
  exchangeRateAsOf: "2026-10-27";
  months: Array<{
    month: string;
    revenueEur: number;
    aiCostUsd: number;
    aiCostEur: number;
    hostingEur: number;
    expensesEur: number;
    netEur: number;
  }>;
};

export type AdminApplicationErrorDetail = {
  id: string;
  code: string;
  statusCode: number;
  occurredAt: string;
  diagnosticCode: string | null;
  context: null;
};

export type AiCostByActor = {
  registeredUsersUsd: number;
  adminsUsd: number;
  anonymousUsd: number;
};

export type AiCostTrendWeek = AiCostByActor & {
  weekStart: string;
  totalUsd: number;
};

export type AdminContactMessage = {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
  sender: { username: string; email: string };
  reply: AdminContactMessageReplyState;
};

export type AdminContactMessageReplyStatus =
  "not_replied" | "sending" | "sent" | "previewed" | "uncertain";

export type AdminContactMessageReplyState = {
  status: AdminContactMessageReplyStatus;
  attemptedAt: string | null;
  retryAllowed: boolean;
};

export type ContactMessageReplyClaim = {
  id: string;
  subject: string;
  createdAt: string;
  recipient: string;
  status: AdminContactMessageReplyStatus;
  attemptedAt: string | null;
  attemptCount: number;
  claimed: boolean;
};

export interface AdminDashboardRepository {
  getSnapshot(): Promise<AdminDashboardSnapshot>;
  getAnonymousAnalytics(): Promise<AnonymousAnalyticsSnapshot>;
  getLighthouseQuality(): Promise<{ runs: LighthouseQualityRun[] }>;
  saveLighthouseQuality(runs: LighthouseQualityRun[]): Promise<void>;
  getApplicationError(id: string): Promise<AdminApplicationErrorDetail | null>;
  listContactMessages(): Promise<AdminContactMessage[]>;
  claimContactMessageReply(
    messageId: string,
    adminUserId: string,
    reviewedWebmail: boolean,
  ): Promise<ContactMessageReplyClaim | null>;
  completeContactMessageReply(
    messageId: string,
    status: "sent" | "previewed" | "uncertain",
  ): Promise<void>;
  recordAiUsage(record: AiUsageRecord): Promise<void>;
  recordApplicationError(
    errorCode: string,
    statusCode: number,
    diagnosticCode?: string,
    _context?: unknown,
  ): Promise<void>;
}

export const ADMIN_DASHBOARD_REPOSITORY = Symbol("ADMIN_DASHBOARD_REPOSITORY");
