import type { ActivePlanWeek } from "../admin-dashboard.models";
import { CHART, WEEK_LABEL } from "../admin-dashboard-formatters";

export function ActivePlansChart({ weeks }: { weeks: ActivePlanWeek[] }) {
  const chartHeight = CHART.height - CHART.top - CHART.bottom;
  const maxUsers = Math.max(
    ...weeks.map((week) => Math.max(week.iluminado, week.falton)),
    1,
  );
  const slotWidth =
    (CHART.width - CHART.left - CHART.right) / Math.max(weeks.length, 1);
  const barWidth = Math.min(24, slotWidth * 0.3);
  return (
    <figure className="admin-ai-cost-chart admin-active-plans-chart">
      <figcaption>Usuarios activos por plan · últimas 8 semanas</figcaption>
      <div className="admin-ai-cost-legend" aria-hidden="true">
        <span>
          <i className="iluminado" />
          Iluminado
        </span>
        <span>
          <i className="falton" />
          Faltón
        </span>
      </div>
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label="Usuarios activos por plan y semana durante las últimas ocho semanas"
      >
        <line
          x1={CHART.left}
          x2={CHART.width - CHART.right}
          y1={CHART.top + chartHeight}
          y2={CHART.top + chartHeight}
          className="admin-chart-axis"
        />
        {weeks.map((week, index) => {
          const center = CHART.left + index * slotWidth + slotWidth / 2;
          const iluminadoHeight = (week.iluminado / maxUsers) * chartHeight;
          const faltonHeight = (week.falton / maxUsers) * chartHeight;
          return (
            <g key={week.weekStart}>
              <title>{`${week.weekStart}: Iluminado ${week.iluminado}; Faltón ${week.falton}`}</title>
              <rect
                x={center - barWidth - 2}
                y={CHART.top + chartHeight - iluminadoHeight}
                width={barWidth}
                height={iluminadoHeight}
                fill="#087f8c"
                rx="3"
              />
              <rect
                x={center + 2}
                y={CHART.top + chartHeight - faltonHeight}
                width={barWidth}
                height={faltonHeight}
                fill="#d94d7b"
                rx="3"
              />
              <text x={center} y={CHART.height - 13} textAnchor="middle">
                {WEEK_LABEL.format(new Date(`${week.weekStart}T12:00:00Z`))}
              </text>
            </g>
          );
        })}
      </svg>
      <details className="admin-chart-details">
        <summary>Ver cifras por semana</summary>
        <div className="admin-table-scroll">
          <table>
            <caption>Datos semanales por plan</caption>
            <thead>
              <tr>
                <th scope="col">Semana de</th>
                <th scope="col">Iluminado</th>
                <th scope="col">Faltón</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.weekStart}>
                  <th scope="row">{week.weekStart}</th>
                  <td>{week.iluminado}</td>
                  <td>{week.falton}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="admin-dashboard-note">
        Se cuenta cada usuario con una suscripción vigente en algún momento de
        la semana, aunque no haya usado el plan.
      </p>
    </figure>
  );
}
