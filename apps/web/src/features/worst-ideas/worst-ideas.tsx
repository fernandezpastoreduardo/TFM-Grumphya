// PROTOTYPE: replace fixture rows with the weekly ranking endpoint before release.
import "./worst-ideas.scss";
const WEEKLY_RANKING = [
  ["La app que cobra por respirar", "184"],
  ["Una red social para los ascensores", "129"],
  ["Uber, pero para mover una silla", "97"],
  ["El metaverso de las reuniones", "83"],
  ["Suscripción mensual a los lunes", "61"],
] as const;

function ExampleDataStamp() {
  return (
    <p className="prototype-stamp">
      <span aria-hidden="true">✳</span> Datos de ejemplo · vista de demostración
    </p>
  );
}

export function WorstIdeas() {
  return (
    <div className="section-content-grid">
      <section
        className="content-card ranking-card"
        aria-labelledby="weekly-title"
      >
        <div className="content-card-heading">
          <div>
            <span className="eyebrow">Semana actual</span>
            <h2 id="weekly-title">Ideas que necesitan sentarse</h2>
          </div>
          <span className="round-illustration" aria-hidden="true">
            ✕
          </span>
        </div>
        <ExampleDataStamp />
        <ol className="idea-ranking">
          {WEEKLY_RANKING.map(([title, count], index) => (
            <li key={title}>
              <span className="ranking-position">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="ranking-title">{title}</span>
              <span className="ranking-count">
                <strong>{count}</strong>
                <small>recepciones</small>
              </span>
            </li>
          ))}
        </ol>
        <p className="privacy-footnote">
          <span aria-hidden="true">⌑</span> Solo mostramos títulos breves y
          cantidades. Sin autor. Sin texto original. Sin cotilleo identificable.
        </p>
      </section>
      <aside className="content-card personal-empty">
        <span className="eyebrow">Tu historial</span>
        <h2>Tú también tienes tus pinitos.</h2>
        <p>
          Cuando tengas cuenta, aquí podrás revisar tus ideas rechazadas. Solo
          tú verás tu historial.
        </p>
        <a className="button-secondary" href="/precios">
          Ver planes para crear una cuenta <span aria-hidden="true">↗</span>
        </a>
        <p className="prototype-stamp">
          Vista de demostración; el historial todavía no está disponible.
        </p>
      </aside>
    </div>
  );
}
