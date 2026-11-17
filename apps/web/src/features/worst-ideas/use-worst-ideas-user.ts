import { useEffect, useState } from "react";
import { loadUserHistory } from "./worst-ideas-user.service";
import type { UserHistoryState } from "./worst-ideas-user.models";

export function useWorstIdeasUser() {
  const [state, setState] = useState<UserHistoryState>({ status: "loading" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    loadUserHistory(controller.signal)
      .then((result) => setState(result))
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
