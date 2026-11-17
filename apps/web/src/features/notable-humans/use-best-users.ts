import { useEffect, useState } from "react";
import {
  getBestListBestUsers,
  type BestUserItem,
} from "./services/get-best-list-best-users";

export type BestUsersState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "success"; users: BestUserItem[] };

export function useBestUsers() {
  const [state, setState] = useState<BestUsersState>({ status: "loading" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    getBestListBestUsers(controller.signal)
      .then((users) => {
        setState(
          users.length === 0
            ? { status: "empty" }
            : { status: "success", users },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [revision]);

  return {
    state,
    retry: () => setRevision((value) => value + 1),
  };
}
