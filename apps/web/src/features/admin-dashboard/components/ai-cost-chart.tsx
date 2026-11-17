import type { AiCostTrendWeek } from "../admin-dashboard.models";
import {
  CHART,
  CHART_COLORS,
  EUR_COST,
  WEEK_LABEL,
} from "../admin-dashboard-formatters";

export function AiCostChart({
  weeks,
  usdToEurRate,
}: {
  weeks: AiCostTrendWeek[];
  usdToEurRate: number;
}) {
  const chartHeight = CHART.height - CHART.top - CHART.bottom;
  const maxCost = Math.max(...weeks.map((week) => week.totalUsd), 0.000001);
  const slotWidth =
    (CHART.width - CHART.left - CHART.right) / Math.max(weeks.length, 1);
  const barWidth = Math.min(48, slotWidth * 0.58);
  return (
    <figure className="admin-ai-cost-chart">
      <figcaption>¿Quién genera el gasto? · últimas 8 semanas</figcaption>
      <div className="admin-ai-cost-legend" aria-hidden="true">
        <span>
          <i className="registered" />
          Cuentas de usuario
        </span>
        <span>
          <i className="admin" />
          Jappy · admin
        </span>
        <span>
          <i className="anonymous" />
          Visitantes sin cuenta
        </span>
      </div>
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label="Gráfico de barras apiladas del coste semanal de IA durante las últimas ocho semanas"
      >
        <line
          x1={CHART.left}
          x2={CHART.width - CHART.right}
          y1={CHART.top + chartHeight}
          y2={CHART.top + chartHeight}
          className="admin-chart-axis"
        />
        {weeks.map((week, index) => {
          const x = CHART.left + index * slotWidth + (slotWidth - barWidth) / 2;
          let y = CHART.top + chartHeight;
          const segments = [
            {
              value: week.registeredUsersUsd,
              color: CHART_COLORS.registeredUsers,
            },
            { value: week.adminsUsd, color: CHART_COLORS.admins },
            { value: week.anonymousUsd, color: CHART_COLORS.anonymous },
          ];
          const bars = segments.map((segment) => {
            const height = (segment.value / maxCost) * chartHeight;
            y -= height;
            return (
              <rect
                key={segment.color}
                x={x}
                y={y}
                width={barWidth}
                height={height}
                fill={segment.color}
                rx="3"
              />
            );
          });
          return (
            <g key={week.weekStart}>
              <title>{`${week.weekStart}: ${EUR_COST.format(week.totalUsd * usdToEurRate)} en total; cuentas ${EUR_COST.format(week.registeredUsersUsd * usdToEurRate)}, Jappy ${EUR_COST.format(week.adminsUsd * usdToEurRate)}, visitantes ${EUR_COST.format(week.anonymousUsd * usdToEurRate)}`}</title>
              {bars}
              <text
                x={x + barWidth / 2}
                y={CHART.height - 13}
                textAnchor="middle"
              >
                {WEEK_LABEL.format(new Date(`${week.weekStart}T12:00:00Z`))}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
