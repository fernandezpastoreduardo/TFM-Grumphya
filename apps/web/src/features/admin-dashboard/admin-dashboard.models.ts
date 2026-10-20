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
