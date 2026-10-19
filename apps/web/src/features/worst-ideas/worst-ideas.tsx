import { useEffect, useState } from "react";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import { WorstIdeasUser } from "./worst-ideas-user";
import "./worst-ideas.scss";

const WORST_IDEAS_ENDPOINT = "/api/worst-ideas";
const ERROR_MESSAGE = "No se ha podido cargar el ranking. Prueba de nuevo.";
const EMPTY_MESSAGE =
  "Esta semana no hay ideas en el ranking. Qué semana tan sospechosamente sensata.";

interface IdeaListItemWorstAll {
  safeTitle: string;
  weeklyCount: number;
}

type RankingState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; ideas: IdeaListItemWorstAll[] };

function isIdeaListItem(value: unknown): value is IdeaListItemWorstAll {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.safeTitle === "string" &&
    item.safeTitle.trim().length > 0 &&
    typeof item.weeklyCount === "number" &&
    Number.isSafeInteger(item.weeklyCount) &&
    item.weeklyCount >= 0
  );
}

async function loadWorstIdeas(
  signal: AbortSignal,
): Promise<IdeaListItemWorstAll[]> {
  const response = await fetch(WORST_IDEAS_ENDPOINT, {
    signal,
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Ranking request failed.");

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || !payload.every(isIdeaListItem)) {
    throw new Error("Ranking response is invalid.");
  }

  return payload;
}

function useWorstIdeasAll() {
  const [state, setState] = useState<RankingState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    loadWorstIdeas(controller.signal)
      .then((ideas) => setState({ status: "success", ideas }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [retry]);

  return { state, retry: () => setRetry((value) => value + 1) };
}

function RankingHeading() {
  return (
    <div className="content-card-heading">
      <div>
        <span className="eyebrow">Semana actual</span>
        <h2 id="weekly-title">Ideas que necesitan sentarse</h2>
      </div>
      <span className="round-illustration" aria-hidden="true">
        ✕
      </span>
    </div>
  );
}

function RankingList({ ideas }: { ideas: IdeaListItemWorstAll[] }) {
  return (
    <ol
      className="idea-ranking"
      aria-label="Ranking semanal de ideas rechazadas"
    >
      {ideas.map((idea, index) => (
        <li key={`${idea.safeTitle}-${index}`}>
          <span className="ranking-position" aria-label={`Puesto ${index + 1}`}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="ranking-title">{idea.safeTitle}</span>
          <span className="ranking-count">
            <strong>{idea.weeklyCount}</strong>
            <small>
              {idea.weeklyCount === 1 ? "recepción" : "recepciones"}
            </small>
          </span>
        </li>
      ))}
    </ol>
  );
}

function RankingContent({ state, retry }: ReturnType<typeof useWorstIdeasAll>) {
  if (state.status === "loading") {
    return (
      <LoadingSkeleton
        label="Cargando el ranking semanal"
        className="idea-ranking-skeleton"
      >
        {Array.from({ length: 5 }, (_, index) => (
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
        {EMPTY_MESSAGE}
      </p>
    );
  }

  return <RankingList ideas={state.ideas} />;
}

export function WorstIdeasAll() {
  const ranking = useWorstIdeasAll();

  return (
    <section
      className="content-card ranking-card"
      aria-labelledby="weekly-title"
    >
      <RankingHeading />
      <RankingContent {...ranking} />
      <p className="privacy-footnote">
        <span aria-hidden="true">⌑</span> Solo mostramos títulos breves y
        cantidades. Sin autor. Sin texto original. Sin cotilleo identificable.
      </p>
    </section>
  );
}

export function WorstIdeas() {
  return (
    <div className="section-content-grid">
      <WorstIdeasAll />
      <WorstIdeasUser />
    </div>
  );
}
