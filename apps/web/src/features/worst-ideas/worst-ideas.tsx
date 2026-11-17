import { WorstIdeasUser } from "./worst-ideas-user";
import {
  WORST_IDEAS_ALL_TIME_ENDPOINT,
  WORST_IDEAS_ENDPOINT,
  EMPTY_ALL_TIME_MESSAGE,
  EMPTY_WEEKLY_MESSAGE,
} from "./worst-ideas.constants";
import { RankingCard } from "./components/worst-ideas-ranking";
import "./worst-ideas.scss";

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
