export interface UserHistoryIdea {
  safeTitle: string;
  count: number;
}

export type UserHistoryState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "error" }
  | { status: "success"; ideas: UserHistoryIdea[] };
