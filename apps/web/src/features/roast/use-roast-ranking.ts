import { useEffect, useState } from "react";
import { type RoastRankingState } from "./components/RoastRanking";
import { getRoastRanking } from "./services/get-roast-ranking";

export function useRoastRanking() {
  const [state, setState] = useState<RoastRankingState>({
    status: "loading",
  });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    getRoastRanking(controller.signal)
      .then((ranking) => setState({ status: "success", ranking }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [revision]);

  return {
    state,
    retry: () => setRevision((current) => current + 1),
  };
}
