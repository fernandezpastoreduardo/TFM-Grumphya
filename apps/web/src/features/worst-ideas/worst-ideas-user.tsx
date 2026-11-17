import { useWorstIdeasUser } from "./use-worst-ideas-user";
import { WorstIdeasUserContent } from "./components/worst-ideas-user-content";
import "./worst-ideas.scss";

export function WorstIdeasUser() {
  const history = useWorstIdeasUser();

  return (
    <aside className="content-card personal-empty" aria-label="Tu historial">
      <span className="eyebrow">Tu historial</span>
      <WorstIdeasUserContent {...history} />
    </aside>
  );
}
