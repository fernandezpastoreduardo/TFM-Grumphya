import type { RoastRankingItem } from "../services/get-roast-ranking";

const LOADING_MESSAGE = "Cargando el ranking de roast…";
const ERROR_MESSAGE = "No se ha podido cargar el ranking. Prueba de nuevo.";
const EMPTY_MESSAGE =
  "Todavía no hay usuarios en el ranking. A alguien le tocará estrenar el podio.";
const WINNER_LABEL = "Ganador del ranking de roast";
const RANKING_TABLE_LABEL = "Puestos del 2 al 10 del ranking de roast";

export type RoastRankingState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; ranking: RoastRankingItem[] };

type RoastRankingProps = {
  state: RoastRankingState;
  onRetry: () => void;
};

export function RoastRanking({ state, onRetry }: RoastRankingProps) {
  return (
    <section
      className="roast-ranking-card"
      aria-labelledby="roast-ranking-title"
    >
      <div className="roast-ranking-heading">
        <div>
          <span className="eyebrow">Marcador público</span>
          <h2 id="roast-ranking-title">Faltón máximo</h2>
        </div>
        <span className="roast-ranking-badge" aria-hidden="true">
          ★
        </span>
      </div>
      {state.status === "loading" ? (
        <p className="roast-ranking-message" role="status">
          {LOADING_MESSAGE}
        </p>
      ) : null}
      {state.status === "error" ? (
        <div className="roast-ranking-message" role="alert">
          <p>{ERROR_MESSAGE}</p>
          <button className="button-secondary" type="button" onClick={onRetry}>
            Volver a intentarlo
          </button>
        </div>
      ) : null}
      {state.status === "success" ? renderRanking(state.ranking) : null}
    </section>
  );
}

function renderRanking(ranking: RoastRankingItem[]) {
  const topTen = ranking.slice(0, 10);
  const winner = topTen[0];
  if (!winner) {
    return <p className="roast-ranking-message">{EMPTY_MESSAGE}</p>;
  }
  const otherUsers = topTen.slice(1);

  return (
    <>
      <div className="roast-ranking-winner" aria-label={WINNER_LABEL}>
        {winner.avatarUrl ? (
          <img className="roast-ranking-avatar" src={winner.avatarUrl} alt="" />
        ) : null}
        <span className="roast-ranking-winner-place">
          Puesto 1 · Faltón máximo
        </span>
        <strong className="roast-ranking-winner-name">{winner.username}</strong>
        <span className="roast-ranking-winner-count">
          {winner.roastMessagesSent}{" "}
          {getRoastMessageLabel(winner.roastMessagesSent)}
        </span>
      </div>
      {otherUsers.length > 0 ? (
        <table className="roast-ranking-table" aria-label={RANKING_TABLE_LABEL}>
          <caption>Puestos del 2 al 10</caption>
          <thead>
            <tr>
              <th scope="col">Usuario</th>
              <th scope="col">Mensajes enviados</th>
            </tr>
          </thead>
          <tbody>
            {otherUsers.map((user, index) => (
              <tr key={user.username} aria-label={`Puesto ${index + 2}`}>
                <th scope="row">
                  {user.avatarUrl ? (
                    <img
                      className="roast-ranking-avatar-small"
                      src={user.avatarUrl}
                      alt=""
                    />
                  ) : null}
                  {user.username}
                </th>
                <td>{user.roastMessagesSent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

function getRoastMessageLabel(count: number): string {
  return count === 1 ? "mensaje de roast" : "mensajes de roast";
}
