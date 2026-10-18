export interface BestUserItem {
  username: string;
  approvedIdeasCount: number;
}

export interface BestUsersRepository {
  getBestListBestUsers(): Promise<BestUserItem[]>;
}

export const BEST_USERS_REPOSITORY = Symbol("BEST_USERS_REPOSITORY");
export const MAX_BEST_USERS = 10;
