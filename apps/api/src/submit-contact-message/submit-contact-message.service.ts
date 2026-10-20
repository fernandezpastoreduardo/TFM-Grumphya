import { Logger } from "@nestjs/common";
import {
  ContactMessageError,
  type ContactMessageMailer,
  type ContactMessageRepository,
  type SavedContactMessage,
} from "./submit-contact-message.models";

const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBJECT_MAX_LENGTH = 120;
const MESSAGE_MIN_LENGTH = 10;
const MESSAGE_MAX_LENGTH = 4000;
const INVALID_MESSAGE =
  "Revisa el asunto y el mensaje. El asunto admite hasta 120 caracteres y el mensaje entre 10 y 4.000.";
const INVALID_REQUEST_KEY = "No se ha podido procesar la solicitud.";
const CONTACT_SUBJECT = "Hemos recibido correctamente tu mensaje";

export class SubmitContactMessage {
  private readonly logger = new Logger(SubmitContactMessage.name);

  constructor(
    private readonly repository: ContactMessageRepository,
    private readonly mailer: ContactMessageMailer,
  ) {}

  async execute(
    userId: unknown,
    idempotencyKey: unknown,
    payload: unknown,
  ): Promise<SavedContactMessage> {
    const authenticatedUserId = parseUserId(userId);
    const key = parseIdempotencyKey(idempotencyKey);
    const contactMessage = parseContactMessage(payload);
    const saved = await this.repository.createForUser(
      authenticatedUserId,
      key,
      contactMessage.subject,
      contactMessage.message,
    );

    if (
      saved.status === "sent" ||
      saved.status === "previewed" ||
      saved.status === "not_requested" ||
      saved.status === "sending"
    )
      return saved;
    const claim = await this.repository.claimConfirmation(
      authenticatedUserId,
      saved.id,
    );
    if (claim !== "claimed") {
      return (
        (await this.repository.getForUser(authenticatedUserId, saved.id)) ??
        saved
      );
    }
    return this.deliver(saved);
  }

  async retryConfirmation(
    userId: unknown,
    messageId: unknown,
  ): Promise<SavedContactMessage> {
    const authenticatedUserId = parseUserId(userId);
    const id = parseMessageId(messageId);
    const saved = await this.repository.getForUser(authenticatedUserId, id);
    if (!saved) {
      throw new ContactMessageError(
        "CONTACT_MESSAGE_NOT_FOUND",
        404,
        "No se ha encontrado el mensaje.",
      );
    }
    const claim = await this.repository.claimConfirmation(
      authenticatedUserId,
      id,
    );
    if (claim === "retry_limit") {
      throw new ContactMessageError(
        "CONTACT_CONFIRMATION_RETRY_LIMIT",
        429,
        "No se ha podido enviar la confirmación. El mensaje sigue guardado; contacta con soporte si lo necesitas.",
      );
    }
    if (claim === "not_found") {
      throw new ContactMessageError(
        "CONTACT_MESSAGE_NOT_FOUND",
        404,
        "No se ha encontrado el mensaje.",
      );
    }
    if (claim !== "claimed") {
      return (
        (await this.repository.getForUser(authenticatedUserId, id)) ?? saved
      );
    }
    return this.deliver(saved);
  }

  private async deliver(
    saved: SavedContactMessage,
  ): Promise<SavedContactMessage> {
    let delivery: "sent" | "previewed";
    try {
      delivery = await this.mailer.sendConfirmation({
        recipient: saved.recipient,
        subject: CONTACT_SUBJECT,
        createdAt: saved.createdAt,
        reference: saved.id,
      });
    } catch {
      const canRetry = await this.repository.markConfirmationFailed(saved.id);
      this.logger.warn("CONTACT_CONFIRMATION_DELIVERY_FAILED");
      return { ...saved, status: "failed", canRetry };
    }
    if (delivery === "previewed") {
      try {
        await this.repository.markConfirmationPreviewed(saved.id);
        return { ...saved, status: "previewed", canRetry: false };
      } catch {
        this.logger.warn("CONTACT_CONFIRMATION_STATUS_UPDATE_FAILED");
        return { ...saved, status: "sending" };
      }
    }
    try {
      await this.repository.markConfirmationSent(saved.id);
      return { ...saved, status: "sent", canRetry: false };
    } catch {
      this.logger.warn("CONTACT_CONFIRMATION_STATUS_UPDATE_FAILED");
      return { ...saved, status: "sending" };
    }
  }
}

function parseUserId(value: unknown): string {
  if (typeof value !== "string" || !USER_ID_PATTERN.test(value)) {
    throw new ContactMessageError(
      "CONTACT_USER_REQUIRED",
      401,
      "Inicia sesión para enviar un mensaje.",
    );
  }
  return value;
}

function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ContactMessageError(
      "INVALID_CONTACT_REQUEST_KEY",
      400,
      INVALID_REQUEST_KEY,
    );
  }
  return value;
}

function parseMessageId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ContactMessageError(
      "CONTACT_MESSAGE_NOT_FOUND",
      404,
      "No se ha encontrado el mensaje.",
    );
  }
  return value;
}

function parseContactMessage(value: unknown): {
  subject: string;
  message: string;
} {
  if (!isRecord(value) || !hasOnlyAllowedKeys(value)) {
    throw invalidContactMessage();
  }
  const subject = typeof value.subject === "string" ? value.subject.trim() : "";
  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (
    subject.length < 3 ||
    subject.length > SUBJECT_MAX_LENGTH ||
    message.length < MESSAGE_MIN_LENGTH ||
    message.length > MESSAGE_MAX_LENGTH
  ) {
    throw invalidContactMessage();
  }
  return { subject, message };
}

function hasOnlyAllowedKeys(value: Record<string, unknown>): boolean {
  return (
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, "subject") &&
    Object.hasOwn(value, "message")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidContactMessage(): ContactMessageError {
  return new ContactMessageError(
    "INVALID_CONTACT_MESSAGE",
    400,
    INVALID_MESSAGE,
  );
}
