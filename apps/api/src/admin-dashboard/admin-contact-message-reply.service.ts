import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  ADMIN_DASHBOARD_REPOSITORY,
  type AdminContactMessageReplyStatus,
  type AdminDashboardRepository,
  type ContactMessageReplyClaim,
} from "./admin-dashboard.models";

export const ADMIN_CONTACT_REPLY_MAILER = Symbol("ADMIN_CONTACT_REPLY_MAILER");

export interface AdminContactReplyMailPort {
  send(input: {
    recipient: string;
    subject: string;
    response: string;
    createdAt: string;
    reference: string;
  }): Promise<"sent" | "previewed">;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESPONSE_MIN_LENGTH = 10;
const RESPONSE_MAX_LENGTH = 4000;
const INVALID_REPLY_MESSAGE =
  "Escribe una respuesta de entre 10 y 4.000 caracteres.";

export type AdminContactReplyResult = {
  status: AdminContactMessageReplyStatus;
  reference: string;
  attemptedAt: string | null;
  retryAllowed: boolean;
};

@Injectable()
export class AdminContactMessageReply {
  private readonly logger = new Logger(AdminContactMessageReply.name);

  constructor(
    @Inject(ADMIN_DASHBOARD_REPOSITORY)
    private readonly repository: AdminDashboardRepository,
    @Inject(ADMIN_CONTACT_REPLY_MAILER)
    private readonly mailer: AdminContactReplyMailPort,
  ) {}

  async execute(
    adminUserId: unknown,
    messageId: unknown,
    payload: unknown,
  ): Promise<AdminContactReplyResult> {
    const adminId = parseUuid(adminUserId, "Inicia sesión como administrador.");
    const id = parseUuid(messageId, "No se ha encontrado el mensaje.");
    const request = parseReplyRequest(payload);
    const claim = await this.repository.claimContactMessageReply(
      id,
      adminId,
      request.reviewedWebmail,
    );
    if (!claim) {
      throw new AdminContactReplyError(
        "CONTACT_MESSAGE_NOT_FOUND",
        404,
        "No se ha encontrado el mensaje.",
      );
    }
    if (!claim.claimed) return toResult(claim);
    return this.deliver(claim, request.response);
  }

  private async deliver(
    claim: ContactMessageReplyClaim,
    response: string,
  ): Promise<AdminContactReplyResult> {
    const safeSubject = buildReplySubject(claim.subject, claim.id);
    try {
      const delivery = await this.mailer.send({
        recipient: claim.recipient,
        subject: safeSubject,
        response,
        createdAt: claim.createdAt,
        reference: claim.id,
      });
      await this.repository.completeContactMessageReply(
        claim.id,
        delivery === "previewed" ? "previewed" : "sent",
      );
      return {
        status: delivery === "previewed" ? "previewed" : "sent",
        reference: claim.id,
        attemptedAt: new Date().toISOString(),
        retryAllowed: false,
      };
    } catch {
      try {
        await this.repository.completeContactMessageReply(
          claim.id,
          "uncertain",
        );
      } catch {
        this.logger.warn("ADMIN_CONTACT_REPLY_STATUS_UPDATE_FAILED");
        return {
          status: "sending",
          reference: claim.id,
          attemptedAt: claim.attemptedAt,
          retryAllowed: false,
        };
      }
      this.logger.warn("ADMIN_CONTACT_REPLY_DELIVERY_UNCERTAIN");
      return {
        status: "uncertain",
        reference: claim.id,
        attemptedAt: new Date().toISOString(),
        retryAllowed: claim.attemptCount < 2,
      };
    }
  }
}

export class AdminContactReplyError extends Error {
  constructor(
    readonly code: "INVALID_CONTACT_REPLY" | "CONTACT_MESSAGE_NOT_FOUND",
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminContactReplyError";
  }
}

function parseUuid(value: unknown, message: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new AdminContactReplyError("CONTACT_MESSAGE_NOT_FOUND", 404, message);
  }
  return value;
}

function parseReplyRequest(value: unknown): {
  response: string;
  reviewedWebmail: boolean;
} {
  if (!isRecord(value)) throw invalidReply();
  const allowedKeys = ["response", "reviewedWebmail"];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key)))
    throw invalidReply();
  const response =
    typeof value.response === "string" ? value.response.trim() : "";
  if (
    response.length < RESPONSE_MIN_LENGTH ||
    response.length > RESPONSE_MAX_LENGTH ||
    hasDisallowedControlCharacter(response) ||
    (value.reviewedWebmail !== undefined &&
      typeof value.reviewedWebmail !== "boolean")
  ) {
    throw invalidReply();
  }
  return { response, reviewedWebmail: value.reviewedWebmail === true };
}

function buildReplySubject(subject: string, messageId: string): string {
  const safeSourceSubject = [...subject]
    .map((character) => (isAsciiControlCharacter(character) ? " " : character))
    .join("")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 100);
  const shortReference = messageId.slice(0, 8).toUpperCase();
  return `Re: ${safeSourceSubject || "Tu mensaje"} [${shortReference}]`;
}

function hasDisallowedControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    if (character === "\n" || character === "\r" || character === "\t")
      return false;
    return isAsciiControlCharacter(character);
  });
}

function isAsciiControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f;
}

function toResult(claim: ContactMessageReplyClaim): AdminContactReplyResult {
  return {
    status: claim.status,
    reference: claim.id,
    attemptedAt: claim.attemptedAt,
    retryAllowed: claim.status === "uncertain" && claim.attemptCount < 2,
  };
}

function invalidReply(): AdminContactReplyError {
  return new AdminContactReplyError(
    "INVALID_CONTACT_REPLY",
    400,
    INVALID_REPLY_MESSAGE,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
