import { authenticatedFetch } from "../../infrastructure/auth/session";

const CONTACT_MESSAGES_ENDPOINT = "/api/contact-messages";
const JSON_CONTENT_TYPE = "application/json";
const IDEMPOTENCY_HEADER = "Idempotency-Key";
const SAVED_STATUS = "saved";
const DELIVERY_STATUSES = [
  "sent",
  "previewed",
  "not_requested",
  "pending",
  "sending",
  "failed",
] as const;

export type ContactDeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type ContactMessageSubmission = {
  status: typeof SAVED_STATUS;
  confirmation: ContactDeliveryStatus;
  retryAllowed: boolean;
  reference: string;
  createdAt: string;
};

export class ContactEmailVerificationRequiredError extends Error {}

async function throwSubmissionError(response: Response): Promise<never> {
  if (response.status === 403) {
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "code" in body &&
        body.code === "EMAIL_VERIFICATION_REQUIRED"
      ) {
        throw new ContactEmailVerificationRequiredError();
      }
    } catch (error) {
      if (error instanceof ContactEmailVerificationRequiredError) throw error;
    }
  }
  throw new Error("CONTACT_MESSAGE_SUBMISSION_FAILED");
}

export async function submitContactMessage(
  subject: string,
  message: string,
  idempotencyKey: string,
): Promise<ContactMessageSubmission> {
  const response = await authenticatedFetch(CONTACT_MESSAGES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": JSON_CONTENT_TYPE,
      [IDEMPOTENCY_HEADER]: idempotencyKey,
    },
    body: JSON.stringify({ subject, message }),
  });
  if (!response.ok) await throwSubmissionError(response);
  return parseSubmission(await response.json());
}

export async function retryContactMessageConfirmation(
  reference: string,
): Promise<ContactMessageSubmission> {
  const response = await authenticatedFetch(
    `${CONTACT_MESSAGES_ENDPOINT}/${encodeURIComponent(reference)}/confirmation/retry`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error("CONTACT_CONFIRMATION_RETRY_FAILED");
  return parseSubmission(await response.json());
}

function parseSubmission(value: unknown): ContactMessageSubmission {
  if (
    typeof value !== "object" ||
    value === null ||
    !("status" in value) ||
    value.status !== SAVED_STATUS ||
    !("confirmation" in value) ||
    typeof value.confirmation !== "string" ||
    !DELIVERY_STATUSES.includes(value.confirmation as ContactDeliveryStatus) ||
    !("retryAllowed" in value) ||
    typeof value.retryAllowed !== "boolean" ||
    !("reference" in value) ||
    typeof value.reference !== "string" ||
    !("createdAt" in value) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))
  ) {
    throw new Error("INVALID_CONTACT_MESSAGE_RESPONSE");
  }
  return {
    status: SAVED_STATUS,
    confirmation: value.confirmation as ContactDeliveryStatus,
    retryAllowed: value.retryAllowed,
    reference: value.reference,
    createdAt: value.createdAt,
  };
}
