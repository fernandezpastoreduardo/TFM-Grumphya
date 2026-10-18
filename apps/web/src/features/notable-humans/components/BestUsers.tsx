import type { BestUserItem } from "../services/get-best-list-best-users";

const LOADING_MESSAGE = "Cargando la clasificación…";
const ERROR_MESSAGE =
  "No se ha podido cargar la clasificación. Prueba de nuevo.";
const EMPTY_MESSAGE =
  "Aún no hay humanos notables. Alguien tendrá que inaugurar la lista.";
const USERS_LIST_LABEL = "Usuarios con más ideas aprobadas";

export type BestUsersState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "success"; users: BestUserItem[] };

type BestUsersProps = {
  state: BestUsersState;
  onRetry: () => void;
};

export function BestUsers({ state, onRetry }: BestUsersProps) {
  if (state.status === "loading") {
    return (
      <p className="ranking-message" role="status">
        {LOADING_MESSAGE}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className="ranking-message" role="alert">
        <p>{ERROR_MESSAGE}</p>
        <button className="button-secondary" type="button" onClick={onRetry}>
          Volver a intentarlo
        </button>
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <p className="ranking-message" role="status">
        {EMPTY_MESSAGE}
      </p>
    );
  }

  const users = state.users.slice(0, 10);
  return (
    <ol className="humans-ranking" aria-label={USERS_LIST_LABEL}>
      {users.map((user, index) => (
        <li
          key={user.username}
          className={index === 0 ? "is-first" : undefined}
        >
          <span className="human-rank" aria-label={`Puesto ${index + 1}`}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="human-avatar" aria-hidden="true">
            {user.username.charAt(0).toUpperCase()}
          </span>
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
