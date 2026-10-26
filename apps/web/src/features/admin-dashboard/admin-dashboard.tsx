import { useEffect, useState, type KeyboardEvent } from "react";
import { authenticatedFetch } from "../../infrastructure/auth/session";
import { AdminContactMessageReply } from "./admin-contact-message-reply";
import type { AdminContactMessage } from "./admin-dashboard.models";
import { AdminErrorDetail } from "./components/admin-error-detail";
import { getApplicationErrorLabel } from "./application-error-labels";
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
  errors: Array<{
    latestEventId: string;
    code: string;
    weeklyCount: number;
    totalCount: number;
    lastOccurredAt: string;
    latestDiagnosticCode: string | null;
  }>;
};
type AiCostByActor = {
  registeredUsersUsd: number;
  adminsUsd: number;
  anonymousUsd: number;
};
type AiCostTrendWeek = AiCostByActor & { weekStart: string; totalUsd: number };
type DashboardState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: DashboardData; messages: AdminContactMessage[] };

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
const DIAGNOSTIC_CODE_PATTERN = /^[a-z][a-z0-9_]{0,99}$/u;
const ERROR_EVENT_ID_PATTERN = /^[1-9]\d{0,18}$/u;
const ADMIN_TABS = [
  { id: "summary", label: "Resumen" },
  { id: "benchmark", label: "Benchmark de IA" },
  { id: "telemetry", label: "Telemetría de IA" },
  { id: "security", label: "Pruebas de seguridad" },
] as const;
type AdminTab = (typeof ADMIN_TABS)[number]["id"];

function getNextTabIndex(currentIndex: number, key: string): number | null {
  if (key === "ArrowRight") return (currentIndex + 1) % ADMIN_TABS.length;
  if (key === "ArrowLeft")
    return (currentIndex - 1 + ADMIN_TABS.length) % ADMIN_TABS.length;
  if (key === "Home") return 0;
  if (key === "End") return ADMIN_TABS.length - 1;
  return null;
}

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
        typeof item.latestEventId === "string" &&
        ERROR_EVENT_ID_PATTERN.test(item.latestEventId) &&
        isCount(item.weeklyCount) &&
        isCount(item.totalCount) &&
        typeof item.lastOccurredAt === "string" &&
        Number.isFinite(Date.parse(item.lastOccurredAt)) &&
        (item.latestDiagnosticCode === null ||
          (typeof item.latestDiagnosticCode === "string" &&
            DIAGNOSTIC_CODE_PATTERN.test(item.latestDiagnosticCode))),
    )
  );
}
function isContact(value: unknown): value is AdminContactMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.subject === "string" &&
    typeof value.message === "string" &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    isRecord(value.sender) &&
    typeof value.sender.username === "string" &&
    typeof value.sender.email === "string" &&
    isRecord(value.reply) &&
    isReplyStatus(value.reply.status) &&
    (value.reply.attemptedAt === null ||
      (typeof value.reply.attemptedAt === "string" &&
        Number.isFinite(Date.parse(value.reply.attemptedAt)))) &&
    typeof value.reply.retryAllowed === "boolean"
  );
}
function isReplyStatus(
  value: unknown,
): value is AdminContactMessage["reply"]["status"] {
  return (
    value === "not_replied" ||
    value === "sending" ||
    value === "sent" ||
    value === "previewed" ||
    value === "uncertain"
  );
}

export function AdminDashboard() {
  const errorEventId = new URLSearchParams(window.location.search).get("error");
  if (errorEventId !== null) {
    return <AdminErrorDetail eventId={errorEventId} />;
  }
  return <AdminDashboardOverview />;
}

function AdminDashboardOverview() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [activeTab, setActiveTab] = useState<AdminTab>("summary");
  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    const nextIndex = getNextTabIndex(currentIndex, event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = ADMIN_TABS[nextIndex];
    setActiveTab(nextTab.id);
    const tabButtons =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
    tabButtons?.[nextIndex]?.focus();
  }
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
      <div
        className="admin-dashboard-tabs"
        role="tablist"
        aria-label="Secciones del panel"
      >
        {ADMIN_TABS.map((tab, index) => (
          <button
            aria-controls={`admin-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            id={`admin-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section
        aria-labelledby={`admin-tab-${activeTab}`}
        className="admin-dashboard-tabpanel"
        id={`admin-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
      >
        {activeTab === "summary" ? (
          <>
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
                value={USD.format(
                  data.estimatedAiCost.weeklyAveragePerAccountUsd,
                )}
              />
              <Metric
                title="Coste medio por cuenta · total"
                value={USD.format(
                  data.estimatedAiCost.totalAveragePerAccountUsd,
                )}
              />
            </section>
            <p className="admin-dashboard-note admin-ai-cost-note">
              El coste medio por cuenta incluye a usuarios registrados y admins
              activos ({data.estimatedAiCost.activeRegisteredAccountCount} y{" "}
              {data.estimatedAiCost.activeAdminAccountCount}, respectivamente).
              Los usos sin cuenta también forman parte del gasto total y se
              muestran aparte. Eventos sin precio configurado:{" "}
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
                        <th scope="col">Error y diagnóstico</th>
                        <th scope="col">Esta semana</th>
                        <th scope="col">Total</th>
                        <th scope="col">Última vez</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.errors.map((error) => (
                        <tr
                          key={`${error.code}:${error.latestDiagnosticCode ?? "none"}`}
                        >
                          <th scope="row">
                            <a
                              href={`/panel-control?error=${encodeURIComponent(error.latestEventId)}`}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              {getApplicationErrorLabel(
                                error.code,
                                error.latestDiagnosticCode,
                              )}
                            </a>
                            {error.latestDiagnosticCode && (
                              <div>
                                <code>{error.latestDiagnosticCode}</code>
                              </div>
                            )}
                          </th>
                          <td>{error.weeklyCount}</td>
                          <td>{error.totalCount}</td>
                          <td>
                            <time dateTime={error.lastOccurredAt}>
                              {DATE.format(new Date(error.lastOccurredAt))}
                            </time>
                          </td>
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
                      <AdminContactMessageReply contact={contact} />
                    </article>
                  ))}
                </div>
              ) : (
                <p>Aún no han llegado mensajes.</p>
              )}
              <p className="admin-dashboard-note">
                Se muestran los 100 mensajes más recientes. Las respuestas se
                envían desde el buzón de IONOS; las respuestas recibidas se
                consultan en el webmail y no se leen desde esta aplicación. Si
                un envío queda sin confirmar, revisa el webmail antes de
                autorizar un reintento.
              </p>
            </section>
          </>
        ) : null}
        {activeTab === "benchmark" ? <BenchmarkTab /> : null}
        {activeTab === "telemetry" ? <TelemetryTab data={data} /> : null}
        {activeTab === "security" ? <SecurityTab /> : null}
      </section>
    </div>
  );
}

function BenchmarkTab() {
  return (
    <section
      className="admin-dashboard-card"
      aria-labelledby="admin-benchmark-title"
    >
      <h2 id="admin-benchmark-title">Benchmark de evaluaciones y prompts</h2>
      <p>
        Compara versiones de instrucciones y modelos con seis casos sintéticos
        etiquetados, incluidos intentos de inyección de instrucciones. No
        utiliza ideas enviadas por usuarios.
      </p>
      <ul>
        <li>Compara el acuerdo con las decisiones esperadas por caso.</li>
        <li>Compara la consistencia de estado y motivo entre variantes.</li>
        <li>
          Las salidas del benchmark contienen métricas agregadas, nunca el texto
          de los casos.
        </li>
      </ul>
      <p>Para ejecutar una comparación desde el entorno de desarrollo:</p>
      <pre>
        <code>
          pnpm --filter @grumphya/api run benchmark:evaluator -- --help
        </code>
      </pre>
      <p className="admin-dashboard-note">
        El benchmark requiere una clave de proveedor y puede generar coste. El
        panel no muestra una última ejecución porque sus resultados no se
        guardan en la base de datos.
      </p>
    </section>
  );
}

function TelemetryTab({ data }: { data: DashboardData }) {
  return (
    <section
      className="admin-dashboard-card"
      aria-labelledby="admin-telemetry-title"
    >
      <h2 id="admin-telemetry-title">Telemetría de operaciones de IA</h2>
      <p>
        Los eventos estructurados registran operación, modelo, resultado,
        latencia, tokens y coste estimado.
      </p>
      <div className="admin-metrics">
        <Metric
          title="Coste estimado · esta semana"
          value={USD.format(data.estimatedAiCost.weeklyUsd)}
        />
        <Metric
          title="Coste estimado · total"
          value={USD.format(data.estimatedAiCost.totalUsd)}
        />
        <Metric
          title="Eventos sin precio configurado"
          value={String(data.estimatedAiCost.unpricedUsageEvents)}
        />
      </div>
      <p className="admin-dashboard-note">
        Las trazas no incluyen ideas, mensajes, direcciones IP, tokens de sesión
        ni identificadores de traza persistentes. Los eventos detallados se
        envían al registro del proceso; el panel muestra costes totales
        agregados y usos sin precio. El registro privado conserva consumo por
        operación y modelo para calcular estas métricas.
      </p>
    </section>
  );
}

function SecurityTab() {
  return (
    <section
      className="admin-dashboard-card"
      aria-labelledby="admin-security-title"
    >
      <h2 id="admin-security-title">Pruebas de seguridad</h2>
      <ul>
        <li>
          Inyección de instrucciones dentro de ideas y descripciones no
          confiables.
        </li>
        <li>
          Cuotas anónimas y de planes, con límites aplicados en el servidor.
        </li>
        <li>
          Aislamiento entre cuentas y acceso al panel protegido por rol admin.
        </li>
        <li>
          Pruebas PostgreSQL de integración con esquemas temporales; E2E con
          repositorios en memoria y servicios locales aislados.
        </li>
      </ul>
      <p>
        La suite automatizada se ejecuta en CI junto con auditoría de
        dependencias y análisis de la imagen de contenedor.
      </p>
      <p className="admin-dashboard-note">
        Consulta los documentos <code>doc/ci-cd.md</code> y{" "}
        <code>doc/ai-evaluation-and-observability.md</code> para comandos,
        alcance y limitaciones.
      </p>
    </section>
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
