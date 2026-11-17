import {
  authenticatedFetch,
  getAccessToken,
} from "../../../infrastructure/auth/session";
import type { RoastFailureDetails } from "./roast-input.models";
import { ROAST_ENDPOINT } from "./roast-input.constants";

export async function requestRoast(value: string): Promise<Response> {
  const accessToken = await getAccessToken();
  const init: RequestInit = {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ message: value }),
  };
  return accessToken
    ? authenticatedFetch(ROAST_ENDPOINT, init)
    : fetch(ROAST_ENDPOINT, init);
}

export function isRoastReply(value: unknown): value is { reply: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "reply" in value &&
    typeof value.reply === "string"
  );
}

export async function readErrorDetails(
  response: Response,
): Promise<RoastFailureDetails> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) {
      return { code: null, scope: null, message: null };
    }
    return {
      code: "code" in payload ? payload.code : null,
      scope: "scope" in payload ? payload.scope : null,
      message:
        "message" in payload && typeof payload.message === "string"
          ? payload.message
          : null,
    };
  } catch {
    return { code: null, scope: null, message: null };
  }
}
