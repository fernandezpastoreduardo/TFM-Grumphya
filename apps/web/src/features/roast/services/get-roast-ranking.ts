import { isPublicAvatarUrl } from "../../../infrastructure/avatar/public-avatar-url";

export interface RoastRankingItem {
  username: string;
  roastMessagesSent: number;
  avatarUrl?: string | null;
}
const ROAST_RANKING_ENDPOINT = "/api/roast-ranking";
const MAX_RANKING_SIZE = 10;

export async function getRoastRanking(
  signal?: AbortSignal,
): Promise<RoastRankingItem[]> {
  const response = await fetch(ROAST_RANKING_ENDPOINT, {
    signal,
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Roast ranking request failed.");

  const payload: unknown = await response.json();
  if (
    !Array.isArray(payload) ||
    payload.length > MAX_RANKING_SIZE ||
    !payload.every(isRoastRankingItem)
  ) {
    throw new Error("Roast ranking response is invalid.");
  }
  return payload;
}

function isRoastRankingItem(value: unknown): value is RoastRankingItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    (Object.keys(item).length === 2 || Object.keys(item).length === 3) &&
    typeof item.username === "string" &&
    item.username.trim().length > 0 &&
    typeof item.roastMessagesSent === "number" &&
    Number.isSafeInteger(item.roastMessagesSent) &&
    item.roastMessagesSent > 0 &&
    (item.avatarUrl === undefined ||
      item.avatarUrl === null ||
      isPublicAvatarUrl(item.avatarUrl))
  );
}
