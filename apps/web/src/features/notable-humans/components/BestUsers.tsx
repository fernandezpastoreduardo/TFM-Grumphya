import { MAX_BEST_USERS } from "../services/get-best-list-best-users";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../../shared/components/loading-skeleton";
import {
  BEST_USERS_EMPTY_MESSAGE,
  BEST_USERS_ERROR_MESSAGE,
  BEST_USERS_LIST_LABEL,
} from "./BestUsers.constants";
import type { BestUsersProps } from "./BestUsers.models";
export type { BestUsersState } from "./BestUsers.models";

export function BestUsers({ state, onRetry }: BestUsersProps) {
  if (state.status === "loading") {
    return (
      <LoadingSkeleton
        label="Cargando la clasificación"
        className="humans-ranking-skeleton"
        showImmediately
      >
        {Array.from({ length: MAX_BEST_USERS }, (_, index) => (
          <div className="humans-ranking-skeleton-row" key={index}>
            <SkeletonBlock className="skeleton-human-rank" />
            <SkeletonBlock className="skeleton-human-avatar" />
            <SkeletonBlock className="skeleton-human-name" />
            <SkeletonBlock className="skeleton-human-count" />
          </div>
        ))}
      </LoadingSkeleton>
    );
  }
  if (state.status === "error") {
    return (
      <div className="ranking-message" role="alert">
        <p>{BEST_USERS_ERROR_MESSAGE}</p>
        <button className="button-secondary" type="button" onClick={onRetry}>
          Volver a intentarlo
        </button>
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <p className="ranking-message" role="status">
        {BEST_USERS_EMPTY_MESSAGE}
      </p>
    );
  }

  const users = state.users.slice(0, 10);
  return (
    <ol className="humans-ranking" aria-label={BEST_USERS_LIST_LABEL}>
      {users.map((user, index) => (
        <li
          key={user.username}
          className={index === 0 ? "is-first" : undefined}
        >
          <span className="human-rank" aria-label={`Puesto ${index + 1}`}>
            {String(index + 1).padStart(2, "0")}
          </span>
          {user.avatarUrl ? (
            <img className="human-avatar" src={user.avatarUrl} alt="" />
          ) : (
            <span className="human-avatar" aria-hidden="true">
              {user.username.charAt(0).toUpperCase()}
            </span>
          )}
          <strong>@{user.username}</strong>
          <span className="approved-count">
            {user.approvedIdeasCount}
            <small>
              {user.approvedIdeasCount === 1 ? " aprobada" : " aprobadas"}
            </small>
          </span>
        </li>
      ))}
    </ol>
  );
}
