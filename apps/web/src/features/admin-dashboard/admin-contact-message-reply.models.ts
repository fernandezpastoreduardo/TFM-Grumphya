import type { AdminContactReplyStatus } from "./admin-dashboard.models";

export type ReplyStatus = AdminContactReplyStatus;

export type ReplyResult = {
  status: ReplyStatus;
  reference: string;
  attemptedAt: string | null;
  retryAllowed: boolean;
};
