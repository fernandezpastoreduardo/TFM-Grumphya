import type { AiUsageRecord } from "../infrastructure/ai/ai-usage";
import type { ApplicationErrorContext } from "../infrastructure/observability/application-error-context";

export type AdminDashboardSnapshot = {
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
  context: ApplicationErrorContext | null;
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
    context?: ApplicationErrorContext,
  ): Promise<void>;
}

export const ADMIN_DASHBOARD_REPOSITORY = Symbol("ADMIN_DASHBOARD_REPOSITORY");
