export type RankingCountField = "count" | "weeklyCount";

export interface RankingIdea {
  safeTitle: string;
  count: number;
}

export type RankingState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; ideas: RankingIdea[] };
