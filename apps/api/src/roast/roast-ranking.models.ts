export interface RoastRankingItem {
  username: string;
  roastMessagesSent: number;
  avatarUrl?: string | null;
}

export interface RoastRankingRepository {
  getRoastRanking(): Promise<RoastRankingItem[]>;
}

export const ROAST_RANKING_REPOSITORY = Symbol("ROAST_RANKING_REPOSITORY");
