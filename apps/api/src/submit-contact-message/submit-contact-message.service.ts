import {
  ContactMessageError,
  type ContactMessageRepository,
} from "./submit-contact-message.models";

const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBJECT_MAX_LENGTH = 120;
const MESSAGE_MIN_LENGTH = 10;
const MESSAGE_MAX_LENGTH = 4000;
const INVALID_MESSAGE =
  "Revisa el asunto y el mensaje. El asunto admite hasta 120 caracteres y el mensaje entre 10 y 4.000.";

export class SubmitContactMessage {
  constructor(private readonly repository: ContactMessageRepository) {}

  async execute(userId: unknown, payload: unknown): Promise<void> {
    if (typeof userId !== "string" || !USER_ID_PATTERN.test(userId)) {
      throw new ContactMessageError(
        "CONTACT_USER_REQUIRED",
        401,
        "Inicia sesión para enviar un mensaje.",
      );
    }

    const contactMessage = parseContactMessage(payload);
    await this.repository.createForUser(
      userId,
      contactMessage.subject,
      contactMessage.message,
    );
  }
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
