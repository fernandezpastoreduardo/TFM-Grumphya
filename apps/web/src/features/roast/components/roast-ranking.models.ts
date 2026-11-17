import type { RoastRankingItem } from "../services/get-roast-ranking";

export type RoastRankingState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; ranking: RoastRankingItem[] };

export type RoastRankingProps = {
  state: RoastRankingState;
  onRetry: () => void;
};
