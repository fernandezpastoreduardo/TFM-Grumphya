export const CONTACT_MESSAGE_REPOSITORY = Symbol("CONTACT_MESSAGE_REPOSITORY");

export interface ContactMessageRepository {
  createForUser(
    userId: string,
    subject: string,
    message: string,
  ): Promise<void>;
}

export type ContactMessageErrorCode =
  "INVALID_CONTACT_MESSAGE" | "CONTACT_USER_REQUIRED";

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
