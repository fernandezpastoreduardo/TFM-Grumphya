import { useEffect, useState } from "react";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import { authenticatedFetch } from "../../infrastructure/auth/session";

const USER_HISTORY_ENDPOINT = "/api/account/worst-ideas";
const ERROR_MESSAGE = "No se ha podido cargar tu historial. Prueba de nuevo.";
const NETWORK_ERROR_MESSAGE =
  "No se ha podido cargar tu historial ahora. Prueba de nuevo.";
const USER_HISTORY_LABEL = "Tus ideas rechazadas";

interface IdeaListItemWorstUser {
  safeTitle: string;
  count: number;
}

type UserHistoryState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "error" }
  | { status: "success"; ideas: IdeaListItemWorstUser[] };

function isIdeaListItem(value: unknown): value is IdeaListItemWorstUser {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.safeTitle === "string" &&
    item.safeTitle.trim().length > 0 &&
    typeof item.count === "number" &&
    Number.isSafeInteger(item.count) &&
    item.count >= 0
  );
}

async function loadUserHistory(signal: AbortSignal): Promise<UserHistoryState> {
  const response = await authenticatedFetch(USER_HISTORY_ENDPOINT, { signal });
  if (response.status === 401) return { status: "anonymous" };
  if (!response.ok) throw new Error(NETWORK_ERROR_MESSAGE);

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || !payload.every(isIdeaListItem)) {
    throw new Error("Invalid user history response.");
  }

  return { status: "success", ideas: payload };
}

function useUserHistory() {
  const [state, setState] = useState<UserHistoryState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    loadUserHistory(controller.signal)
      .then((result) => setState(result))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [retry]);

  return { state, retry: () => setRetry((value) => value + 1) };
}

function UserHistoryList({ ideas }: { ideas: IdeaListItemWorstUser[] }) {
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

function UserHistoryContent({
  state,
  retry,
}: ReturnType<typeof useUserHistory>) {
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
        <p>{ERROR_MESSAGE}</p>
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

export function WorstIdeasUser() {
  const history = useUserHistory();

  return (
    <aside className="content-card personal-empty" aria-label="Tu historial">
      <span className="eyebrow">Tu historial</span>
      <UserHistoryContent {...history} />
    </aside>
  );
}
