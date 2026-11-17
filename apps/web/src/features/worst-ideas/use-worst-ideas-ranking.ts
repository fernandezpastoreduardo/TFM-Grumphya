import { useEffect, useState } from "react";
import { loadWorstIdeas } from "./worst-ideas.service";
import type { RankingCountField, RankingState } from "./worst-ideas.models";

export function useWorstIdeasRanking(
  endpoint: string,
  countField: RankingCountField,
) {
  const [state, setState] = useState<RankingState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    loadWorstIdeas(controller.signal, endpoint, countField)
      .then((ideas) => setState({ status: "success", ideas }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [countField, endpoint, retry]);

  return { state, retry: () => setRetry((value) => value + 1) };
}
