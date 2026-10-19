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
    weeklyAveragePerUserUsd: number;
    totalAveragePerUserUsd: number;
    registeredUserCount: number;
    unpricedUsageEvents: number;
  };
  errors: Array<{ code: string; weeklyCount: number; totalCount: number }>;
};
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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
    isCount(costs.weeklyAveragePerUserUsd) &&
    isCount(costs.totalAveragePerUserUsd) &&
    isCount(costs.registeredUserCount) &&
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
          title="Coste medio por usuario · semana"
          value={USD.format(data.estimatedAiCost.weeklyAveragePerUserUsd)}
        />
        <Metric
          title="Coste medio por usuario · total"
          value={USD.format(data.estimatedAiCost.totalAveragePerUserUsd)}
        />
      </section>
      <p className="admin-dashboard-note">
        El promedio se calcula entre {data.estimatedAiCost.registeredUserCount}{" "}
        cuentas de usuario; excluye Jappy y usos sin cuenta. Eventos sin precio
        configurado: {data.estimatedAiCost.unpricedUsageEvents}.
      </p>
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

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <article className="admin-metric">
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}
