import { Pool } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { ContactMessageError } from "./submit-contact-message.models";
import type {
  ConfirmationClaim,
  ContactMessageRepository,
  SavedContactMessage,
} from "./submit-contact-message.models";

export class PostgresContactMessageRepository implements ContactMessageRepository {
  private readonly pool: Pool;
  private ready: Promise<void> | undefined;

  constructor(
    pool?: Pool,
    private readonly migrationRunner: (
      pool: Pool,
    ) => Promise<void> = runMigrations,
  ) {
    this.pool = pool ?? createPostgresPool();
  }

  async createForUser(
    userId: string,
    idempotencyKey: string,
    subject: string,
    message: string,
  ): Promise<SavedContactMessage> {
    await this.ensureReady();
    await this.pool.query<{ id: string }>(
      `INSERT INTO contact_messages
         (user_id, subject, message, idempotency_key, confirmation_status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [userId, subject, message, idempotencyKey],
    );
    const result = await this.pool.query<ContactMessageRow>(
      `SELECT contact.id,contact.subject,contact.created_at,
         contact.confirmation_status,contact.confirmation_attempts,user_account.email
       FROM contact_messages contact
       JOIN users user_account ON user_account.id=contact.user_id
       WHERE contact.user_id=$1 AND contact.idempotency_key=$2
         AND contact.subject=$3 AND contact.message=$4`,
      [userId, idempotencyKey, subject, message],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ContactMessageError(
        "CONTACT_REQUEST_KEY_REUSED",
        409,
        "La solicitud anterior sigue asociada a este envío. Revisa el estado del mensaje.",
      );
    }
    return toSavedContactMessage(row);
  }

  async getForUser(
    userId: string,
    messageId: string,
  ): Promise<SavedContactMessage | null> {
    await this.ensureReady();
    const result = await this.pool.query<ContactMessageRow>(
      `SELECT contact.id,contact.subject,contact.created_at,
         contact.confirmation_status,contact.confirmation_attempts,user_account.email
       FROM contact_messages contact
       JOIN users user_account ON user_account.id=contact.user_id
       WHERE contact.user_id=$1 AND contact.id=$2`,
      [userId, messageId],
    );
    const row = result.rows[0];
    return row ? toSavedContactMessage(row) : null;
  }

  async claimConfirmation(
    userId: string,
    messageId: string,
  ): Promise<ConfirmationClaim> {
    await this.ensureReady();
    const claimed = await this.pool.query(
      `UPDATE contact_messages
       SET confirmation_status='sending',
           confirmation_attempts=confirmation_attempts+1,
           confirmation_last_attempt_at=now(),confirmation_error_code=NULL
       WHERE user_id=$1 AND id=$2
         AND confirmation_status IN ('pending','failed')
         AND confirmation_attempts < $3
       RETURNING id`,
      [userId, messageId, MAX_CONFIRMATION_ATTEMPTS],
    );
    if (claimed.rowCount) return "claimed";
    const result = await this.pool.query<{
      confirmation_status: string;
      confirmation_attempts: number;
    }>(
      `SELECT confirmation_status,confirmation_attempts
       FROM contact_messages WHERE user_id=$1 AND id=$2`,
      [userId, messageId],
    );
    const row = result.rows[0];
    if (!row) return "not_found";
    if (row.confirmation_status === "sent") return "already_sent";
    if (row.confirmation_status === "previewed") return "already_previewed";
    if (row.confirmation_status === "not_requested") return "not_requested";
    if (row.confirmation_status === "sending") return "in_progress";
    if (row.confirmation_attempts >= MAX_CONFIRMATION_ATTEMPTS)
      return "retry_limit";
    return "in_progress";
  }

  async markConfirmationSent(messageId: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query(
      `UPDATE contact_messages SET confirmation_status='sent',
         confirmation_sent_at=now(),confirmation_error_code=NULL
       WHERE id=$1 AND confirmation_status='sending'`,
      [messageId],
    );
  }

  async markConfirmationPreviewed(messageId: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query(
      `UPDATE contact_messages SET confirmation_status='previewed',
         confirmation_sent_at=NULL,confirmation_error_code=NULL
       WHERE id=$1 AND confirmation_status='sending'`,
      [messageId],
    );
  }

  async markConfirmationFailed(messageId: string): Promise<boolean> {
    await this.ensureReady();
    const result = await this.pool.query<{ confirmation_attempts: number }>(
      `UPDATE contact_messages SET confirmation_status='failed',
         confirmation_error_code='MAIL_DELIVERY_FAILED'
       WHERE id=$1 AND confirmation_status='sending'
       RETURNING confirmation_attempts`,
      [messageId],
    );
    return (
      (result.rows[0]?.confirmation_attempts ?? MAX_CONFIRMATION_ATTEMPTS) <
      MAX_CONFIRMATION_ATTEMPTS
    );
  }

  private async ensureReady(): Promise<void> {
    this.ready ??= this.migrationRunner(this.pool);
    await this.ready;
  }
}

const MAX_CONFIRMATION_ATTEMPTS = 3;

type ContactMessageRow = {
  id: string;
  subject: string;
  created_at: Date;
  confirmation_status:
    "not_requested" | "pending" | "sending" | "sent" | "previewed" | "failed";
  confirmation_attempts: number;
  email: string;
};

function toSavedContactMessage(row: ContactMessageRow): SavedContactMessage {
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    recipient: row.email,
    subject: row.subject,
    status: row.confirmation_status,
    canRetry:
      (row.confirmation_status === "pending" ||
        row.confirmation_status === "failed") &&
      row.confirmation_attempts < MAX_CONFIRMATION_ATTEMPTS,
  };
}
