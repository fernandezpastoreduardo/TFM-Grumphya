import type { DashboardData } from "../admin-dashboard.models";
import {
  BCE_EXCHANGE_RATES_URL,
  CHART,
  DECIMAL_FOUR,
  EUR,
  EUR_WHOLE,
  MONTH_LABEL,
  MONTH_YEAR_LABEL,
  REFERENCE_DATE_LABEL,
} from "../admin-dashboard-formatters";

export function AnnualFinanceChart({
  finance,
}: {
  finance: DashboardData["annualFinance"];
}) {
  const { months } = finance;
  const netCents = Math.round(
    months.reduce((sum, month) => sum + month.netEur, 0) * 100,
  );
  const net = netCents === 0 ? 0 : netCents / 100;
  const chartHeight = CHART.height - CHART.top - CHART.bottom;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const maxAmount = Math.max(
    ...months.flatMap((month) => [month.revenueEur, month.expensesEur]),
    1,
  );
  const xFor = (index: number) =>
    CHART.left + ((index + 0.5) * plotWidth) / Math.max(months.length, 1);
  const yFor = (amount: number) =>
    CHART.top + chartHeight - (amount / maxAmount) * chartHeight;
  const incomePoints = months
    .map((month, index) => `${xFor(index)},${yFor(month.revenueEur)}`)
    .join(" ");
  const expensePoints = months
    .map((month, index) => `${xFor(index)},${yFor(month.expensesEur)}`)
    .join(" ");
  return (
    <section
      className="admin-dashboard-card admin-annual-finance"
      aria-labelledby="admin-annual-finance-title"
    >
      <span className="eyebrow">Balance anual · EUR</span>
      <h2 id="admin-annual-finance-title">
        Ingresos y gastos · {finance.year}
      </h2>
      <p className="admin-annual-net">
        Resultado acumulado hasta hoy: <strong>{EUR.format(net)}</strong>
      </p>
      <figure className="admin-ai-cost-chart">
        <figcaption>Ingresos simulados frente a gastos por mes</figcaption>
        <div className="admin-ai-cost-legend" aria-hidden="true">
          <span>
            <i className="income" />
            Ingresos simulados
          </span>
          <span>
            <i className="expenses" />
            Gastos estimados
          </span>
        </div>
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label={`Ingresos y gastos por mes de ${finance.year} hasta la fecha actual`}
        >
          <line
            x1={CHART.left}
            x2={CHART.width - CHART.right}
            y1={CHART.top + chartHeight}
            y2={CHART.top + chartHeight}
            className="admin-chart-axis"
          />
          <polyline
            points={incomePoints}
            fill="none"
            stroke="#087f8c"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <polyline
            points={expensePoints}
            fill="none"
            stroke="#d94d7b"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {months.map((month, index) => (
            <g key={month.month}>
              <title>{`${month.month}: ingresos simulados ${EUR.format(month.revenueEur)}; gastos estimados ${EUR.format(month.expensesEur)}; resultado ${EUR.format(month.netEur)}`}</title>
              <circle
                cx={xFor(index)}
                cy={yFor(month.revenueEur)}
                r="5"
                fill="#087f8c"
              />
              <circle
                cx={xFor(index)}
                cy={yFor(month.expensesEur)}
                r="5"
                fill="#d94d7b"
              />
              <text x={xFor(index)} y={CHART.height - 13} textAnchor="middle">
                {MONTH_LABEL.format(new Date(`${month.month}-15T12:00:00Z`))}
              </text>
            </g>
          ))}
        </svg>
      </figure>
      <details className="admin-chart-details">
        <summary>Ver cifras por mes</summary>
        <div className="admin-table-scroll">
          <table>
            <caption>Datos mensuales de ingresos y gastos</caption>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Ingresos simulados</th>
                <th scope="col">Gastos estimados</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month}>
                  <th scope="row">{month.month}</th>
                  <td>{EUR.format(month.revenueEur)}</td>
                  <td>{EUR.format(month.expensesEur)}</td>
                  <td>{EUR.format(month.netEur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="admin-annual-explanation">
        <p>
          <strong>Ingresos:</strong> pagos simulados de suscripciones
          confirmadas; no son cobros reales.
        </p>
        <p>
          <strong>Gastos:</strong> coste estimado de tokens consumidos,
          convertido de USD a EUR con la{" "}
          <a
            href={BCE_EXCHANGE_RATES_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            referencia fija del {finance.exchangeRateSource}
          </a>{" "}
          del{" "}
          {REFERENCE_DATE_LABEL.format(
            new Date(`${finance.exchangeRateAsOf}T12:00:00Z`),
          )}{" "}
          (1 USD = {DECIMAL_FOUR.format(finance.usdToEurRate)} EUR), más{" "}
          {EUR_WHOLE.format(finance.hostingMonthlyEur)} al mes de hosting desde{" "}
          {MONTH_YEAR_LABEL.format(
            new Date(`${finance.hostingStartsMonth}-15T12:00:00Z`),
          )}
          . Los eventos de IA sin precio conocido quedan fuera; es una
          estimación, no la factura del proveedor.
        </p>
      </div>
    </section>
  );
}
