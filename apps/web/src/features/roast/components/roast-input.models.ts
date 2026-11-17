import type { AccountAttempts } from "../../../infrastructure/auth/use-session-status";

export type RoastInputProps = {
  remainingAttempts: number | null;
  quotaLimit: number;
  quotaDescription: string;
  onSubmitted: (message: string, reply: string) => void;
  onUsageRefresh: () => Promise<void>;
  onAccountUsageRefresh?: () => Promise<AccountAttempts | null>;
  onDailyQuotaExhausted?: () => void;
  onReplyUnavailable: () => void;
  onEmailVerificationRequired?: () => void;
};

export type RoastFailureDetails = {
  code: unknown;
  scope: unknown;
  message: string | null;
};
