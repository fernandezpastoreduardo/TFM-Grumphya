import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../infrastructure/auth/session";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import "./admin-dashboard.scss";

type DashboardData = {
  revenue: { weeklyEur: number; totalEur: number };
  estimatedAiCost: {
    weeklyUsd: number;
    totalUsd: number;
    weeklyAveragePerAccountUsd: number;
    totalAveragePerAccountUsd: number;
    activeRegisteredAccountCount: number;
    activeAdminAccountCount: number;
    weeklyByActor: AiCostByActor;
    totalByActor: AiCostByActor;
    weeklyTrend: AiCostTrendWeek[];
    unpricedUsageEvents: number;
  };
  errors: Array<{ code: string; weeklyCount: number; totalCount: number }>;
};
type AiCostByActor = {
  registeredUsersUsd: number;
  adminsUsd: number;
  anonymousUsd: number;
};
type AiCostTrendWeek = AiCostByActor & { weekStart: string; totalUsd: number };
type ContactMessage = {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
  sender: { username: string; email: string };
};
type DashboardState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: DashboardData; messages: ContactMessage[] };

const DASHBOARD_ERROR = "No se han podido consultar los datos del panel.";
const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});
const USD = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});
const DATE = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});
const WEEK_LABEL = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isAiCostByActor(value: unknown): value is AiCostByActor {
  return (
    isRecord(value) &&
    isCount(value.registeredUsersUsd) &&
    isCount(value.adminsUsd) &&
    isCount(value.anonymousUsd)
  );
}
function isAiCostTrendWeek(value: unknown): value is AiCostTrendWeek {
  return (
    isRecord(value) &&
    typeof value.weekStart === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value.weekStart) &&
    isCount(value.totalUsd) &&
    isAiCostByActor(value)
  );
}
function isDashboardData(value: unknown): value is DashboardData {
  if (
    !isRecord(value) ||
    !isRecord(value.revenue) ||
    !isRecord(value.estimatedAiCost) ||
    !Array.isArray(value.errors)
  )
    return false;
  const revenue = value.revenue;
  const costs = value.estimatedAiCost;
  return (
    isCount(revenue.weeklyEur) &&
    isCount(revenue.totalEur) &&
    isCount(costs.weeklyUsd) &&
    isCount(costs.totalUsd) &&
    isCount(costs.weeklyAveragePerAccountUsd) &&
    isCount(costs.totalAveragePerAccountUsd) &&
    isCount(costs.activeRegisteredAccountCount) &&
    isCount(costs.activeAdminAccountCount) &&
    isAiCostByActor(costs.weeklyByActor) &&
    isAiCostByActor(costs.totalByActor) &&
    Array.isArray(costs.weeklyTrend) &&
    costs.weeklyTrend.every(isAiCostTrendWeek) &&
    isCount(costs.unpricedUsageEvents) &&
    value.errors.every(
      (item) =>
        isRecord(item) &&
        typeof item.code === "string" &&
        isCount(item.weeklyCount) &&
        isCount(item.totalCount),
    )
  );
}
function isContact(value: unknown): value is ContactMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.subject === "string" &&
    typeof value.message === "string" &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    isRecord(value.sender) &&
    typeof value.sender.username === "string" &&
    typeof value.sender.email === "string"
  );
}

export function AdminDashboard() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    Promise.all([
      authenticatedFetch("/api/admin/dashboard"),
      authenticatedFetch("/api/admin/contact-messages"),
    ])
      .then(async ([dashboardResponse, contactsResponse]) => {
        const [dashboardBody, contactsBody]: [unknown, unknown] =
          await Promise.all([
            dashboardResponse.json(),
            contactsResponse.json(),
          ]);
        if (!active) return;
        if (
          !dashboardResponse.ok ||
          !contactsResponse.ok ||
          !isDashboardData(dashboardBody) ||
          !isRecord(contactsBody) ||
          !Array.isArray(contactsBody.messages) ||
          !contactsBody.messages.every(isContact)
        ) {
          setState({ status: "error" });
          return;
        }
        setState({
          status: "ready",
          data: dashboardBody,
          messages: contactsBody.messages,
        });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading")
    return (
      <LoadingSkeleton
        label="Cargando el panel de administración"
        className="admin-dashboard-skeleton"
      >
        <div className="admin-dashboard-skeleton-heading">
          <SkeletonBlock className="skeleton-admin-eyebrow" />
          <SkeletonBlock className="skeleton-admin-title" />
          <SkeletonBlock className="skeleton-admin-copy" />
        </div>
        <div className="admin-metrics">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="admin-metric admin-metric-skeleton" key={index}>
              <SkeletonBlock className="skeleton-admin-label" />
              <SkeletonBlock className="skeleton-admin-value" />
            </div>
          ))}
        </div>
        <div className="admin-dashboard-card admin-table-skeleton">
          <SkeletonBlock className="skeleton-admin-title" />
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonBlock className="skeleton-admin-table-row" key={index} />
          ))}
        </div>
        <div className="admin-dashboard-card admin-contacts-skeleton">
          <SkeletonBlock className="skeleton-admin-title" />
          {Array.from({ length: 2 }, (_, index) => (
            <SkeletonBlock className="skeleton-admin-contact" key={index} />
          ))}
        </div>
      </LoadingSkeleton>
    );
  if (state.status === "error")
    return (
      <section className="admin-dashboard-error" role="alert">
        <h2>Panel no disponible</h2>
        <p>{DASHBOARD_ERROR}</p>
      </section>
    );

  const { data } = state;
  return (
    <div className="admin-dashboard">
      <section
        className="admin-dashboard-heading"
        aria-labelledby="admin-dashboard-title"
      >
        <span className="eyebrow">Zona de administración</span>
        <h2 id="admin-dashboard-title">Hola, Jappy.</h2>
        <p>
          Los ingresos son simulados. El coste de IA es una estimación basada en
          tokens registrados.
        </p>
      </section>
      <section
        className="admin-metrics"
        aria-label="Ingresos simulados y costes estimados"
      >
        <Metric
          title="Ingresos simulados · esta semana"
          value={EUR.format(data.revenue.weeklyEur)}
        />
        <Metric
          title="Ingresos simulados · total"
          value={EUR.format(data.revenue.totalEur)}
        />
        <Metric
          title="Coste IA · esta semana"
          value={USD.format(data.estimatedAiCost.weeklyUsd)}
        />
        <Metric
          title="Coste IA · total"
          value={USD.format(data.estimatedAiCost.totalUsd)}
        />
        <Metric
          title="Coste medio por cuenta · semana"
          value={USD.format(data.estimatedAiCost.weeklyAveragePerAccountUsd)}
        />
        <Metric
          title="Coste medio por cuenta · total"
          value={USD.format(data.estimatedAiCost.totalAveragePerAccountUsd)}
        />
      </section>
      <p className="admin-dashboard-note">
        El coste medio por cuenta incluye a usuarios registrados y admins
        activos ({data.estimatedAiCost.activeRegisteredAccountCount} y{" "}
        {data.estimatedAiCost.activeAdminAccountCount}, respectivamente). Los
        usos sin cuenta también forman parte del gasto total y se muestran
        aparte. Eventos sin precio configurado:{" "}
        {data.estimatedAiCost.unpricedUsageEvents}.
      </p>
      <section
        className="admin-dashboard-card admin-ai-costs"
        aria-labelledby="admin-ai-costs-title"
      >
        <div className="admin-dashboard-section-heading">
          <div>
            <span className="eyebrow">Gastos de IA · USD</span>
            <h2 id="admin-ai-costs-title">Quién genera el coste</h2>
          </div>
        </div>
        <CostBreakdown
          title="Esta semana"
          costs={data.estimatedAiCost.weeklyByActor}
        />
        <CostBreakdown
          title="Acumulado"
          costs={data.estimatedAiCost.totalByActor}
        />
        <AiCostChart weeks={data.estimatedAiCost.weeklyTrend} />
      </section>
      <section
        className="admin-dashboard-card"
        aria-labelledby="admin-errors-title"
      >
        <h2 id="admin-errors-title">Errores más registrados</h2>
        {data.errors.length ? (
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Esta semana</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.errors.map((error) => (
                  <tr key={error.code}>
                    <th scope="row">{error.code}</th>
                    <td>{error.weeklyCount}</td>
                    <td>{error.totalCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No hay errores registrados.</p>
        )}
      </section>
      <section
        className="admin-dashboard-card"
        aria-labelledby="admin-contacts-title"
      >
        <div className="admin-dashboard-section-heading">
          <div>
            <span className="eyebrow">Bandeja de entrada</span>
            <h2 id="admin-contacts-title">Mensajes de contacto</h2>
          </div>
          <span>{state.messages.length}</span>
        </div>
        {state.messages.length ? (
          <div className="admin-contact-list">
            {state.messages.map((contact) => (
              <article className="admin-contact" key={contact.id}>
                <div className="admin-contact-heading">
                  <div>
                    <h3>{contact.subject}</h3>
                    <p>
                      {contact.sender.username} ·{" "}
                      <a
                        href={`mailto:${encodeURIComponent(contact.sender.email)}`}
                      >
                        {contact.sender.email}
                      </a>
                    </p>
                  </div>
                  <time dateTime={contact.createdAt}>
                    {DATE.format(new Date(contact.createdAt))}
                  </time>
                </div>
                <p className="admin-contact-message">{contact.message}</p>
              </article>
            ))}
          </div>
        ) : (
          <p>Aún no han llegado mensajes.</p>
        )}
        <p className="admin-dashboard-note">
          Se muestran los 100 mensajes más recientes. El envío de confirmaciones
          y respuestas por correo está pendiente.
        </p>
      </section>
    </div>
  );
}

function CostBreakdown({
  title,
  costs,
}: {
  title: string;
  costs: AiCostByActor;
}) {
  return (
    <div className="admin-cost-breakdown">
      <h3>{title}</h3>
      <dl>
        <div>
          <dt>Cuentas de usuario</dt>
          <dd>{USD.format(costs.registeredUsersUsd)}</dd>
        </div>
        <div>
          <dt>Jappy · admin</dt>
          <dd>{USD.format(costs.adminsUsd)}</dd>
        </div>
        <div>
          <dt>Visitantes sin cuenta</dt>
          <dd>{USD.format(costs.anonymousUsd)}</dd>
        </div>
      </dl>
    </div>
  );
}

const CHART = {
  width: 720,
  height: 230,
  top: 14,
  bottom: 42,
  left: 36,
  right: 12,
};
const CHART_COLORS = {
  registeredUsers: "#087f8c",
  admins: "#e89b22",
  anonymous: "#d94d7b",
} as const;

function AiCostChart({ weeks }: { weeks: AiCostTrendWeek[] }) {
  const chartHeight = CHART.height - CHART.top - CHART.bottom;
  const maxCost = Math.max(...weeks.map((week) => week.totalUsd), 0.000001);
  const slotWidth = (CHART.width - CHART.left - CHART.right) / weeks.length;
  const barWidth = Math.min(48, slotWidth * 0.58);
  return (
    <figure className="admin-ai-cost-chart">
      <figcaption>Coste de IA por semana · últimas 8 semanas</figcaption>
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
              <title>{`${week.weekStart}: ${USD.format(week.totalUsd)} en total; cuentas ${USD.format(week.registeredUsersUsd)}, Jappy ${USD.format(week.adminsUsd)}, visitantes ${USD.format(week.anonymousUsd)}`}</title>
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

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <article className="admin-metric">
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}
