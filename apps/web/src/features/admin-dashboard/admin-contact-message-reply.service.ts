import { authenticatedFetch } from "../../infrastructure/auth/session";
import type {
  ReplyResult,
  ReplyStatus,
} from "./admin-contact-message-reply.models";

export async function sendReply(
  messageId: string,
  response: string,
  reviewedWebmail: boolean,
): Promise<ReplyResult> {
  const endpoint =
    "/api/admin/contact-messages/" + encodeURIComponent(messageId) + "/reply";
  const result = await authenticatedFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      response,
      ...(reviewedWebmail ? { reviewedWebmail } : {}),
    }),
  });
  if (!result.ok) throw new Error("ADMIN_CONTACT_REPLY_FAILED");
  return parseReplyResult(await result.json());
}

function parseReplyResult(value: unknown): ReplyResult {
  if (
    !isRecord(value) ||
    !isReplyStatus(value.status) ||
    typeof value.reference !== "string" ||
    (value.attemptedAt !== null && typeof value.attemptedAt !== "string") ||
    typeof value.retryAllowed !== "boolean"
  ) {
    throw new Error("INVALID_ADMIN_CONTACT_REPLY_RESPONSE");
  }
  return {
    status: value.status,
    reference: value.reference,
    attemptedAt: value.attemptedAt,
    retryAllowed: value.retryAllowed,
  };
}

function isReplyStatus(value: unknown): value is ReplyStatus {
  return (
    value === "not_replied" ||
    value === "sending" ||
    value === "sent" ||
    value === "previewed" ||
    value === "uncertain"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
