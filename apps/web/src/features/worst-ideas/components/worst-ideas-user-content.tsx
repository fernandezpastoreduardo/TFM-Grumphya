import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../../shared/components/loading-skeleton";
import {
  USER_HISTORY_ERROR,
  USER_HISTORY_LABEL,
} from "../worst-ideas-user.constants";
import type {
  UserHistoryIdea,
  UserHistoryState,
} from "../worst-ideas-user.models";

function UserHistoryList({ ideas }: { ideas: UserHistoryIdea[] }) {
  return (
    <ol
      className="idea-ranking idea-ranking-user"
      aria-label={USER_HISTORY_LABEL}
    >
      {ideas.map((idea) => (
        <li key={idea.safeTitle}>
          <span className="ranking-title">{idea.safeTitle}</span>
          <span className="ranking-count">
            <strong>{idea.count}</strong>
            <small>{idea.count === 1 ? "vez" : "veces"}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function WorstIdeasUserContent({
  state,
  retry,
}: {
  state: UserHistoryState;
  retry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <LoadingSkeleton
        label="Cargando tu historial"
        className="user-history-skeleton"
      >
        <SkeletonBlock className="skeleton-history-heading" />
        <SkeletonBlock className="skeleton-history-copy" />
        {Array.from({ length: 3 }, (_, index) => (
          <div className="user-history-skeleton-row" key={index}>
            <SkeletonBlock className="skeleton-history-title" />
            <SkeletonBlock className="skeleton-history-count" />
          </div>
        ))}
      </LoadingSkeleton>
    );
  }

  if (state.status === "anonymous") {
    return (
      <>
        <h2>Tú también tienes tus pinitos.</h2>
        <p>
          Cuando tengas cuenta, aquí podrás revisar tus ideas rechazadas. Solo
          tú verás tu historial.
        </p>
        <a className="button-secondary worst-ideas-history-cta" href="/precios">
          Ver planes para crear una cuenta <span aria-hidden="true">↗</span>
        </a>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <div className="ranking-message" role="alert">
        <p>{USER_HISTORY_ERROR}</p>
        <button className="button-secondary" type="button" onClick={retry}>
          Volver a intentarlo
        </button>
      </div>
    );
  }

  if (state.ideas.length === 0) {
    return (
      <>
        <h2>Tú también harás tus pinitos.</h2>
        <p>
          Cuando plantes alguno, aquí podrás revisar tus ideas rechazadas. Solo
          tú verás tu historial.
        </p>
      </>
    );
  }

  return (
    <>
      <h2>Tú también tienes tus pinitos.</h2>
      <p>Estas son tus ideas rechazadas. Solo tú puedes ver este historial.</p>
      <UserHistoryList ideas={state.ideas} />
    </>
  );
}
