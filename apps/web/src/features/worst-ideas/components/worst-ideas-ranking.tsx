import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../../shared/components/loading-skeleton";
import { useWorstIdeasRanking } from "../use-worst-ideas-ranking";
import { ERROR_MESSAGE, MAX_RANKING_ITEMS } from "../worst-ideas.constants";
import type {
  RankingCountField,
  RankingIdea,
  RankingState,
} from "../worst-ideas.models";

export function RankingHeading({
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

export function RankingList({
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

export function RankingContent({
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

export function RankingCard({
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
