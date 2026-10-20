export const CONTACT_MESSAGE_REPOSITORY = Symbol("CONTACT_MESSAGE_REPOSITORY");
export const CONTACT_MESSAGE_MAILER = Symbol("CONTACT_MESSAGE_MAILER");

export type ContactMessageDeliveryStatus =
  "not_requested" | "pending" | "sending" | "sent" | "previewed" | "failed";

export type SavedContactMessage = {
  id: string;
  createdAt: string;
  recipient: string;
  subject: string;
  status: ContactMessageDeliveryStatus;
  canRetry: boolean;
};

export type ConfirmationClaim =
  | "claimed"
  | "not_found"
  | "already_sent"
  | "already_previewed"
  | "not_requested"
  | "in_progress"
  | "retry_limit";

export interface ContactMessageRepository {
  createForUser(
    userId: string,
    idempotencyKey: string,
    subject: string,
    message: string,
  ): Promise<SavedContactMessage>;
  getForUser(
    userId: string,
    messageId: string,
  ): Promise<SavedContactMessage | null>;
  claimConfirmation(
    userId: string,
    messageId: string,
  ): Promise<ConfirmationClaim>;
  markConfirmationSent(messageId: string): Promise<void>;
  markConfirmationPreviewed(messageId: string): Promise<void>;
  markConfirmationFailed(messageId: string): Promise<boolean>;
}

export interface ContactMessageMailer {
  sendConfirmation(input: {
    recipient: string;
    subject: string;
    createdAt: string;
    reference: string;
  }): Promise<"sent" | "previewed">;
}

export type ContactMessageErrorCode =
  | "INVALID_CONTACT_MESSAGE"
  | "CONTACT_USER_REQUIRED"
  | "INVALID_CONTACT_REQUEST_KEY"
  | "CONTACT_REQUEST_KEY_REUSED"
  | "CONTACT_MESSAGE_NOT_FOUND"
  | "CONTACT_CONFIRMATION_RETRY_LIMIT";

export class ContactMessageError extends Error {
  constructor(
    readonly code: ContactMessageErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ContactMessageError";
  }
}
