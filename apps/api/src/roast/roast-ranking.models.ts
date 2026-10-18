export interface RoastRankingItem {
  username: string;
  roastMessagesSent: number;
}

export interface RoastRankingRepository {
  getRoastRanking(): Promise<RoastRankingItem[]>;
}

export const ROAST_RANKING_REPOSITORY = Symbol("ROAST_RANKING_REPOSITORY");
