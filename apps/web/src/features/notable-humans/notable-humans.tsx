// PROTOTYPE: aliases and approval counts are visual fixtures, never real leaderboard data.
const NOTABLE_HUMANS = [
  ["laura_critica", "18"],
  ["pablo_sin_pitch", "13"],
  ["marta_beta", "9"],
  ["dani_valida", "8"],
  ["ines_pregunta", "7"],
  ["alex_sin_humo", "6"],
  ["rocio_mvp", "5"],
  ["marcos_realista", "4"],
  ["eva_observa", "3"],
  ["toni_iteracion", "2"],
] as const;

export function NotableHumans() {
  return (
    <div className="humans-layout">
      <section
        className="content-card humans-card"
        aria-labelledby="humans-rank-title"
      >
        <div className="content-card-heading">
          <div>
            <span className="eyebrow">Clasificación de muestra</span>
            <h2 id="humans-rank-title">La gente que sí miró antes de saltar</h2>
          </div>
          <span
            className="round-illustration star-illustration"
            aria-hidden="true"
          >
            ✦
          </span>
        </div>
        <p className="prototype-stamp">
          <span aria-hidden="true">✳</span> Datos de ejemplo · vista de
          demostración
        </p>
        <ol className="humans-ranking">
          {NOTABLE_HUMANS.map(([alias, count], index) => (
            <li key={alias} className={index === 0 ? "is-first" : undefined}>
              <span className="human-rank">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="human-avatar" aria-hidden="true">
                {alias.charAt(0).toUpperCase()}
              </span>
              <strong>@{alias}</strong>
              <span className="approved-count">
                {count}
                <small> aprobadas</small>
              </span>
            </li>
          ))}
        </ol>
        <p className="privacy-footnote">
          Tus buenas ideas, las aprobadas, son tuyas. Aquí solo compartimos
          alias y número de aprobaciones.
        </p>
      </section>
      <aside className="human-callout">
        <div className="human-callout-face" aria-hidden="true">
          ◉‿◉
        </div>
        <span className="eyebrow">Tu turno</span>
        <h2>La próxima idea brillante podría ser tuya.</h2>
        <p>
          No hace falta un pitch con fuegos artificiales. Empieza por explicar a
          quién ayudas.
        </p>
        <a className="button-secondary" href="/">
          Probar una idea <span aria-hidden="true">↗</span>
        </a>
      </aside>
    </div>
  );
}
