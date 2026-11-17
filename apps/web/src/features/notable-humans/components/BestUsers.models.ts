import type { BestUserItem } from "../services/get-best-list-best-users";

export type BestUsersState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "success"; users: BestUserItem[] };

export type BestUsersProps = {
  state: BestUsersState;
  onRetry: () => void;
};
