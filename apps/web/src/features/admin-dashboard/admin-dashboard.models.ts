export type AnalyticsPage =
  | "home"
  | "precios"
  | "buenas-practicas"
  | "humanos-notables"
  | "lo-peor-de-lo-peor"
  | "contacto"
  | "descargate"
  | "other_public_pages";

export type AdminContactReplyStatus =
  "not_replied" | "sending" | "sent" | "previewed" | "uncertain";

export type AdminContactMessage = {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
  sender: { username: string; email: string };
  reply: {
    status: AdminContactReplyStatus;
    attemptedAt: string | null;
    retryAllowed: boolean;
  };
};

export type AdminLighthouseRun = {
  commitSha: string;
  measuredAt: string;
  page: "home" | "precios" | "lo-peor-de-lo-peor";
  device: "mobile" | "desktop";
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

export type RecentAiActivity = {
  hour: string;
  operation: "idea_evaluation" | "roast";
  model: string;
  eventCount: number;
  inputTokenBucket: TokenVolumeBucket;
  cachedInputTokenBucket: TokenVolumeBucket;
  outputTokenBucket: TokenVolumeBucket;
  estimatedCostUsd: number | null;
};

export type LoginSecurityMetrics = {
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

export type MaximumPlanCost = {
  averagePerAttemptUsd: number | null;
  monthlyMaximumUsd: number | null;
  pricedAttempts: number;
};

export type ActivePlanWeek = {
  weekStart: string;
  iluminado: number;
  falton: number;
};

export type FinanceMonth = {
  month: string;
  revenueEur: number;
  aiCostUsd: number;
  aiCostEur: number;
  hostingEur: number;
  expensesEur: number;
  netEur: number;
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

export type DashboardData = {
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

export type AnonymousAnalyticsData = {
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

export type DashboardState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      data: DashboardData;
      messages: AdminContactMessage[];
      anonymousAnalytics: AnonymousAnalyticsData;
      webQuality: AdminLighthouseRun[];
    };
