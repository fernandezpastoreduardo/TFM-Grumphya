import type { AiUsageRecord } from "../infrastructure/ai/ai-usage";

export type AdminDashboardSnapshot = {
  revenue: { weeklyEur: number; totalEur: number };
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
    code: string;
    weeklyCount: number;
    totalCount: number;
  }>;
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
};

export interface AdminDashboardRepository {
  getSnapshot(): Promise<AdminDashboardSnapshot>;
  listContactMessages(): Promise<AdminContactMessage[]>;
  recordAiUsage(record: AiUsageRecord): Promise<void>;
  recordApplicationError(errorCode: string, statusCode: number): Promise<void>;
}

export const ADMIN_DASHBOARD_REPOSITORY = Symbol("ADMIN_DASHBOARD_REPOSITORY");
