import { useEffect, useState } from "react";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import { WorstIdeasUser } from "./worst-ideas-user";
import "./worst-ideas.scss";

const WORST_IDEAS_ENDPOINT = "/api/worst-ideas";
const WORST_IDEAS_ALL_TIME_ENDPOINT = "/api/worst-ideas/all-time";
const ERROR_MESSAGE = "No se ha podido cargar el ranking. Prueba de nuevo.";
// Keep in sync with the public ranking endpoint's maximum response size.
const MAX_RANKING_ITEMS = 10;
const EMPTY_WEEKLY_MESSAGE =
  "Esta semana no hay ideas en el ranking. Qué semana tan sospechosamente sensata.";
const EMPTY_ALL_TIME_MESSAGE =
  "Aún no hay ideas rechazadas para inaugurar este ranking. No te emociones.";

type RankingCountField = "count" | "weeklyCount";

interface RankingIdea {
  safeTitle: string;
  count: number;
}

type RankingState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; ideas: RankingIdea[] };

function parseRankingItems(
  value: unknown,
  countField: RankingCountField,
): RankingIdea[] | null {
  if (!Array.isArray(value)) return null;

  const ideas: RankingIdea[] = [];
  for (const itemValue of value) {
    if (typeof itemValue !== "object" || itemValue === null) return null;
    const item = itemValue as Record<string, unknown>;
    const safeTitle = item.safeTitle;
    const count = item[countField];
    if (
      typeof safeTitle !== "string" ||
      safeTitle.trim().length === 0 ||
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      return null;
    }
    ideas.push({ safeTitle, count });
  }

  return ideas;
}

async function loadWorstIdeas(
  signal: AbortSignal,
  endpoint: string,
  countField: RankingCountField,
): Promise<RankingIdea[]> {
  const response = await fetch(endpoint, { signal, credentials: "omit" });
  if (!response.ok) throw new Error("Ranking request failed.");

  const payload: unknown = await response.json();
  const ideas = parseRankingItems(payload, countField);
  if (!ideas) throw new Error("Ranking response is invalid.");

  return ideas;
}

function useWorstIdeasRanking(endpoint: string, countField: RankingCountField) {
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

function RankingHeading({
  id,
  eyebrow,
  title,
}: {
  id: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="content-card-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={id}>{title}</h2>
      </div>
      <span className="round-illustration" aria-hidden="true">
        ✕
      </span>
    </div>
  );
}

function RankingList({
  ideas,
  label,
}: {
  ideas: RankingIdea[];
  label: string;
}) {
  return (
    <ol className="idea-ranking" aria-label={label}>
      {ideas.map((idea, index) => (
        <li key={`${idea.safeTitle}-${index}`}>
          <span className="ranking-position" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="ranking-title">{idea.safeTitle}</span>
          <span className="ranking-count">
            <strong>{idea.count}</strong>
            <small>{idea.count === 1 ? "recepción" : "recepciones"}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

function RankingContent({
  state,
  retry,
  loadingLabel,
  emptyMessage,
  listLabel,
}: {
  state: RankingState;
  retry: () => void;
  loadingLabel: string;
  emptyMessage: string;
  listLabel: string;
}) {
  if (state.status === "loading") {
    return (
      <LoadingSkeleton
        label={loadingLabel}
        className="idea-ranking-skeleton"
        showImmediately
      >
        {Array.from({ length: MAX_RANKING_ITEMS }, (_, index) => (
          <div className="idea-ranking-skeleton-row" key={index}>
            <SkeletonBlock className="skeleton-ranking-position" />
            <SkeletonBlock className="skeleton-ranking-title" />
            <SkeletonBlock className="skeleton-ranking-count" />
          </div>
        ))}
      </LoadingSkeleton>
    );
  }

  if (state.status === "error") {
    return (
      <div className="ranking-message" role="alert">
        <p>{ERROR_MESSAGE}</p>
        <button className="button-secondary" type="button" onClick={retry}>
          Volver a intentarlo
        </button>
      </div>
    );
  }

  if (state.ideas.length === 0) {
    return (
      <p className="ranking-message" role="status">
        {emptyMessage}
      </p>
    );
  }

  return <RankingList ideas={state.ideas} label={listLabel} />;
}

function RankingCard({
  endpoint,
  countField,
  titleId,
  eyebrow,
  title,
  loadingLabel,
  emptyMessage,
  listLabel,
}: {
  endpoint: string;
  countField: RankingCountField;
  titleId: string;
  eyebrow: string;
  title: string;
  loadingLabel: string;
  emptyMessage: string;
  listLabel: string;
}) {
  const ranking = useWorstIdeasRanking(endpoint, countField);

  return (
    <section className="content-card ranking-card" aria-labelledby={titleId}>
      <RankingHeading id={titleId} eyebrow={eyebrow} title={title} />
      <RankingContent
        {...ranking}
        loadingLabel={loadingLabel}
        emptyMessage={emptyMessage}
        listLabel={listLabel}
      />
      <p className="privacy-footnote">
        <span aria-hidden="true">⌑</span> Solo mostramos títulos breves y
        cantidades. Sin autor. Sin texto original. Sin cotilleo identificable.
      </p>
    </section>
  );
}

export function WorstIdeasAllTime() {
  return (
    <RankingCard
      endpoint={WORST_IDEAS_ALL_TIME_ENDPOINT}
      countField="count"
      titleId="all-time-title"
      eyebrow="Desde el inicio"
      title="Las peores ideas de todos los tiempos"
      loadingLabel="Cargando el ranking histórico"
      emptyMessage={EMPTY_ALL_TIME_MESSAGE}
      listLabel="Ranking histórico de ideas rechazadas"
    />
  );
}

export function WorstIdeasAll() {
  return (
    <RankingCard
      endpoint={WORST_IDEAS_ENDPOINT}
      countField="weeklyCount"
      titleId="weekly-title"
      eyebrow="Semana actual"
      title="Ideas que necesitan sentarse"
      loadingLabel="Cargando el ranking semanal"
      emptyMessage={EMPTY_WEEKLY_MESSAGE}
      listLabel="Ranking semanal de ideas rechazadas"
    />
  );
}

export function WorstIdeas() {
  return (
    <div className="section-content-grid worst-ideas-layout">
      <div className="worst-ideas-rankings">
        <WorstIdeasAllTime />
        <WorstIdeasAll />
      </div>
      <WorstIdeasUser />
    </div>
  );
}
