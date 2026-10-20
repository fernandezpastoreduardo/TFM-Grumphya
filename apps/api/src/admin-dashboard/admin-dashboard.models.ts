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
  recordApplicationError(errorCode: string, statusCode: number): Promise<void>;
}

export const ADMIN_DASHBOARD_REPOSITORY = Symbol("ADMIN_DASHBOARD_REPOSITORY");
