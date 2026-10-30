import { isPublicAvatarUrl } from "../../../infrastructure/avatar/public-avatar-url";

export interface BestUserItem {
  username: string;
  approvedIdeasCount: number;
  avatarUrl?: string | null;
}
const BEST_USERS_ENDPOINT = "/api/best-users";
export const MAX_BEST_USERS = 10;

export async function getBestListBestUsers(
  signal?: AbortSignal,
): Promise<BestUserItem[]> {
  const response = await fetch(BEST_USERS_ENDPOINT, {
    signal,
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Best users request failed.");

  const payload: unknown = await response.json();
  if (
    !Array.isArray(payload) ||
    payload.length > MAX_BEST_USERS ||
    !payload.every(isBestUserItem)
  ) {
    throw new Error("Best users response is invalid.");
  }
  return payload;
}

function isBestUserItem(value: unknown): value is BestUserItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    (Object.keys(item).length === 2 || Object.keys(item).length === 3) &&
    typeof item.username === "string" &&
    item.username.trim().length > 0 &&
    typeof item.approvedIdeasCount === "number" &&
    Number.isSafeInteger(item.approvedIdeasCount) &&
    item.approvedIdeasCount > 0 &&
    (item.avatarUrl === undefined ||
      item.avatarUrl === null ||
      isPublicAvatarUrl(item.avatarUrl))
  );
}
