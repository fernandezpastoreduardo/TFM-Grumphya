import type { AnonymousAnalyticsData } from "../admin-dashboard.models";
import {
  ANALYTICS_MONTH,
  ANALYTICS_PAGE_LABELS,
  ANALYTICS_PLAN_LABELS,
} from "../admin-dashboard-formatters";

export function AnonymousAnalyticsTab({
  data,
}: {
  data: AnonymousAnalyticsData;
}) {
  const completeDeviceBreakdown = data.deviceShares.length === 2;
  return (
    <section
      className="admin-analytics"
      aria-labelledby="admin-analytics-title"
    >
      <header className="admin-dashboard-card">
        <span className="eyebrow">
          Sin visitas únicas. Sin perseguir a nadie.
        </span>
        <h2 id="admin-analytics-title">Analítica anónima</h2>
        <p>
          Recuentos propios por periodo y categoría. Una recarga vuelve a
          contar; estos números describen actividad, no personas ni sesiones.
        </p>
      </header>
      <section
        className="admin-dashboard-card"
        aria-labelledby="admin-views-title"
      >
        <h2 id="admin-views-title">
          Páginas públicas más vistas · últimos 30 días cerrados
        </h2>
        <AnalyticsBarList
          empty="Todavía no hay categorías con diez vistas o más."
          entries={data.viewsByPage.map((entry) => ({
            label: ANALYTICS_PAGE_LABELS[entry.page],
            count: entry.count,
          }))}
        />
      </section>
      <div className="admin-analytics-grid">
        <section
          className="admin-dashboard-card"
          aria-labelledby="admin-device-title"
        >
          <h2 id="admin-device-title">
            Tamaño de pantalla · últimos 30 días cerrados
          </h2>
          {completeDeviceBreakdown ? (
            <AnalyticsBarList
              entries={data.deviceShares.map((entry) => ({
                label:
                  entry.device === "mobile"
                    ? "Móvil · estrecha"
                    : "Escritorio · amplia",
                count: entry.percentage,
                suffix: `${entry.percentage} %`,
              }))}
            />
          ) : (
            <p>
              No se muestra el reparto hasta que ambas categorías alcancen diez
              vistas.
            </p>
          )}
          <p className="admin-dashboard-note">
            Es una estimación basada en el ancho de ventana, no en la identidad
            ni el modelo del dispositivo.
          </p>
        </section>
        <section
          className="admin-dashboard-card"
          aria-labelledby="admin-plans-title"
        >
          <h2 id="admin-plans-title">
            Interés en los planes · últimos 6 meses cerrados
          </h2>
          <p>Selecciones y activaciones simuladas agregadas por mes y plan.</p>
          <AnalyticsPlanMonths
            selections={data.monthlyPlanSelections}
            activations={data.monthlyPlanActivations}
          />
          <p className="admin-dashboard-note">
            No se enlaza una vista con una selección o activación. Son recuentos
            paralelos, no una tasa individual de conversión.
          </p>
        </section>
      </div>
      <p className="admin-dashboard-note">
        Solo se guardan contadores diarios. No se guardan IP, cookies, agente de
        navegador, URL completa, cuenta, identificador de visita ni texto
        enviado. Las páginas de poco tráfico se agrupan; los grupos de plan con
        menos de diez eventos se omiten. Los datos se eliminan tras trece meses.
      </p>
    </section>
  );
}

export function AnalyticsBarList({
  entries,
  empty = "No hay suficientes datos para mostrar estas categorías.",
}: {
  entries: Array<{ label: string; count: number; suffix?: string }>;
  empty?: string;
}) {
  if (!entries.length) return <p>{empty}</p>;
  const maximum = Math.max(...entries.map((entry) => entry.count));
  return (
    <ul className="admin-analytics-bar-list">
      {entries.map((entry) => (
        <li key={entry.label}>
          <span>{entry.label}</span>
          <span className="admin-analytics-bar-track" aria-hidden="true">
            <span
              className="admin-analytics-bar"
              style={{
                width: `${Math.max(4, (entry.count / maximum) * 100)}%`,
              }}
            />
          </span>
          <strong>{entry.suffix ?? entry.count}</strong>
        </li>
      ))}
    </ul>
  );
}

export function AnalyticsPlanMonths({
  selections,
  activations,
}: {
  selections: AnonymousAnalyticsData["monthlyPlanSelections"];
  activations: AnonymousAnalyticsData["monthlyPlanActivations"];
}) {
  const months = [
    ...new Set([
      ...selections.map((entry) => entry.month),
      ...activations.map((entry) => entry.month),
    ]),
  ].sort((left, right) => left.localeCompare(right, "es-ES"));
  if (!months.length)
    return <p>Aún no hay grupos mensuales con diez eventos.</p>;
  return (
    <div className="admin-table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Plan</th>
            <th scope="col">Clics en «Elegir»</th>
            <th scope="col">Activaciones simuladas</th>
          </tr>
        </thead>
        <tbody>
          {months.flatMap((month) =>
            (["ILUMINADO", "FALTON"] as const).map((plan) => {
              const chosen = selections.find(
                (entry) => entry.month === month && entry.plan === plan,
              );
              const activated = activations.find(
                (entry) => entry.month === month && entry.plan === plan,
              );
              if (!chosen && !activated) return null;
              return (
                <tr key={`${month}:${plan}`}>
                  <th scope="row">
                    {ANALYTICS_MONTH.format(new Date(`${month}-01T12:00:00Z`))}
                  </th>
                  <td>{ANALYTICS_PLAN_LABELS[plan]}</td>
                  <td>{chosen?.count ?? "No mostrado"}</td>
                  <td>{activated?.count ?? "No mostrado"}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}
