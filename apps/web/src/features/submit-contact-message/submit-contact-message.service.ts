import { authenticatedFetch } from "../../infrastructure/auth/session";

const CONTACT_MESSAGES_ENDPOINT = "/api/contact-messages";
const JSON_CONTENT_TYPE = "application/json";

export async function submitContactMessage(
  subject: string,
  message: string,
): Promise<void> {
  const response = await authenticatedFetch(CONTACT_MESSAGES_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": JSON_CONTENT_TYPE },
    body: JSON.stringify({ subject, message }),
  });
  if (!response.ok) throw new Error("CONTACT_MESSAGE_SUBMISSION_FAILED");
}
