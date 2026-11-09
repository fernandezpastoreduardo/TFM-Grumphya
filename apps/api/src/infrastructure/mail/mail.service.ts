import { Injectable } from "@nestjs/common";
import { isEmailAddress } from "../validation/email-address";
import { SmtpMailTransport, type MailEnvelope } from "./smtp-mail.transport";

export type MailMessage = MailEnvelope;
export type MailDeliveryResult = "sent" | "previewed";
export type LocalMailPreview = MailEnvelope & { createdAt: string };

const REQUIRED_SMTP_SETTINGS = [
  "MAIL_SMTP_HOST",
  "MAIL_SMTP_PORT",
  "MAIL_USERNAME",
  "MAIL_PASSWORD",
  "MAIL_FROM_ADDRESS",
] as const;
const MAIL_TIMEOUT_MESSAGE = "El servicio de correo no está disponible ahora.";

@Injectable()
export class MailService {
  private readonly smtp?: SmtpMailTransport;
  private latestLocalPreview?: LocalMailPreview;

  constructor() {
    const isProduction = process.env.NODE_ENV === "production";
    const missing = REQUIRED_SMTP_SETTINGS.filter(
      (name) => !process.env[name]?.trim(),
    );
    if (isProduction && missing.length > 0) {
      throw new Error(
        `Production mail configuration is incomplete: ${missing.join(", ")}.`,
      );
    }
    if (isProduction) {
      const port = Number(process.env.MAIL_SMTP_PORT);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("MAIL_SMTP_PORT must be a valid TCP port.");
      }
      this.smtp = new SmtpMailTransport({
        host: process.env.MAIL_SMTP_HOST!.trim(),
        port,
        username: process.env.MAIL_USERNAME!.trim(),
        password: process.env.MAIL_PASSWORD!,
        fromAddress: requireEmail(process.env.MAIL_FROM_ADDRESS!),
      });
    }
  }

  async send(message: MailMessage): Promise<MailDeliveryResult> {
    validateMessage(message);
    if (this.smtp) {
      await this.smtp.send(message);
      return "sent";
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error(MAIL_TIMEOUT_MESSAGE);
    }
    this.latestLocalPreview = {
      ...message,
      createdAt: new Date().toISOString(),
    };
    return "previewed";
  }

  getLatestLocalPreview(): LocalMailPreview | undefined {
    if (process.env.NODE_ENV === "production") return undefined;
    return this.latestLocalPreview;
  }
}

function validateMessage(message: MailMessage): void {
  requireEmail(message.to);
  if (message.replyTo) requireEmail(message.replyTo);
  if (
    !message.subject.trim() ||
    message.subject.includes("\r") ||
    message.subject.includes("\n") ||
    typeof message.text !== "string" ||
    typeof message.html !== "string"
  ) {
    throw new Error("Invalid outgoing email.");
  }
}

function requireEmail(value: string): string {
  const email = value.trim();
  if (!isEmailAddress(email)) {
    throw new Error("Mail address configuration is invalid.");
  }
  return email;
}
