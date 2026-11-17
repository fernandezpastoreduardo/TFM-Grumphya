import type { AdminContactMessage } from "./admin-dashboard.models";
import { isRecord } from "./admin-dashboard.validation.shared";

export function isContact(value: unknown): value is AdminContactMessage {
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
