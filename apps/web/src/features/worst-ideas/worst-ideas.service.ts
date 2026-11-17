import type { RankingCountField, RankingIdea } from "./worst-ideas.models";

export function parseRankingItems(
  value: unknown,
  countField: RankingCountField,
): RankingIdea[] | null {
  if (!Array.isArray(value)) return null;

  const ideas: RankingIdea[] = [];
  for (const itemValue of value) {
    if (typeof itemValue !== "object" || itemValue === null) return null;
    const item = itemValue as Record<string, unknown>;
    const safeTitle = item.safeTitle;
    const count = item[countField];
    if (
      typeof safeTitle !== "string" ||
      safeTitle.trim().length === 0 ||
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      return null;
    }
    ideas.push({ safeTitle, count });
  }

  return ideas;
}

export async function loadWorstIdeas(
  signal: AbortSignal,
  endpoint: string,
  countField: RankingCountField,
): Promise<RankingIdea[]> {
  const response = await fetch(endpoint, { signal, credentials: "omit" });
  if (!response.ok) throw new Error("Ranking request failed.");

  const payload: unknown = await response.json();
  const ideas = parseRankingItems(payload, countField);
  if (!ideas) throw new Error("Ranking response is invalid.");

  return ideas;
}
