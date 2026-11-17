import { authenticatedFetch } from "../../infrastructure/auth/session";
import { USER_HISTORY_ENDPOINT } from "./worst-ideas-user.constants";
import type {
  UserHistoryIdea,
  UserHistoryState,
} from "./worst-ideas-user.models";

export async function loadUserHistory(
  signal: AbortSignal,
): Promise<UserHistoryState> {
  const response = await authenticatedFetch(USER_HISTORY_ENDPOINT, { signal });
  if (response.status === 401) return { status: "anonymous" };
  if (!response.ok) throw new Error("User history request failed.");

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || !payload.every(isUserHistoryIdea)) {
    throw new Error("Invalid user history response.");
  }

  return { status: "success", ideas: payload };
}

function isUserHistoryIdea(value: unknown): value is UserHistoryIdea {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.safeTitle === "string" &&
    item.safeTitle.trim().length > 0 &&
    typeof item.count === "number" &&
    Number.isSafeInteger(item.count) &&
    item.count >= 0
  );
}
