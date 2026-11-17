import type { AdminLighthouseRun } from "../admin-dashboard.models";
import {
  DATE,
  LIGHTHOUSE_NUMBER,
  LIGHTHOUSE_PAGE_LABELS,
  LIGHTHOUSE_SCORE,
} from "../admin-dashboard-formatters";

export function LighthouseQualityTab({ runs }: { runs: AdminLighthouseRun[] }) {
  return (
    <section
      className="admin-analytics"
      aria-labelledby="lighthouse-quality-title"
    >
      <header className="admin-dashboard-card">
        <span className="eyebrow">
          Pruebas sintéticas · no mide visitas reales
        </span>
        <h2 id="lighthouse-quality-title">Calidad web · Lighthouse</h2>
        <p>
          Última medición disponible por página y dispositivo. CI mide una
          compilación local con datos públicos de prueba para el ranking, sin
          pasar por la red ni la API de producción.
        </p>
      </header>
      {runs.length === 0 ? (
        <section className="admin-dashboard-card" role="status">
          <p>Todavía no hay mediciones publicadas desde CI.</p>
        </section>
      ) : (
        <div className="admin-analytics-grid">
          {runs.map((run) => (
            <article
              className="admin-dashboard-card"
              key={`${run.page}-${run.device}`}
              aria-label={`${LIGHTHOUSE_PAGE_LABELS[run.page]} · ${run.device === "mobile" ? "móvil" : "escritorio"}`}
            >
              <h3>
                {LIGHTHOUSE_PAGE_LABELS[run.page]} ·{" "}
                {run.device === "mobile" ? "Móvil" : "Escritorio"}
              </h3>
              <dl className="admin-lighthouse-scores">
                <div>
                  <dt>Rendimiento</dt>
                  <dd>{LIGHTHOUSE_SCORE.format(run.performance)}</dd>
                </div>
                <div>
                  <dt>Accesibilidad</dt>
                  <dd>{LIGHTHOUSE_SCORE.format(run.accessibility)}</dd>
                </div>
                <div>
                  <dt>Buenas prácticas</dt>
                  <dd>{LIGHTHOUSE_SCORE.format(run.bestPractices)}</dd>
                </div>
                <div>
                  <dt>SEO</dt>
                  <dd>{LIGHTHOUSE_SCORE.format(run.seo)}</dd>
                </div>
                <div>
                  <dt>LCP</dt>
                  <dd>
                    {run.lcpMs === null
                      ? "—"
                      : `${LIGHTHOUSE_NUMBER.format(run.lcpMs)} ms`}
                  </dd>
                </div>
                <div>
                  <dt>CLS</dt>
                  <dd>
                    {run.cls === null ? "—" : LIGHTHOUSE_NUMBER.format(run.cls)}
                  </dd>
                </div>
                <div>
                  <dt>TBT</dt>
                  <dd>
                    {run.tbtMs === null
                      ? "—"
                      : `${LIGHTHOUSE_NUMBER.format(run.tbtMs)} ms`}
                  </dd>
                </div>
                <div>
                  <dt>Speed Index</dt>
                  <dd>
                    {run.speedIndexMs === null
                      ? "—"
                      : `${LIGHTHOUSE_NUMBER.format(run.speedIndexMs)} ms`}
                  </dd>
                </div>
              </dl>
              <p className="admin-dashboard-note">
                Mediana por métrica de {run.sampleCount} mediciones ·{" "}
                {DATE.format(new Date(run.measuredAt))} · commit{" "}
                {run.commitSha.slice(0, 7)}
              </p>
            </article>
          ))}
        </div>
      )}
      <p className="admin-dashboard-note">
        Son mediciones de laboratorio en un navegador automatizado; no son Core
        Web Vitals de usuarios reales. Los resultados del inspector sobre
        producción pueden variar por red, equipo, contenido y sesión.
      </p>
    </section>
  );
}
