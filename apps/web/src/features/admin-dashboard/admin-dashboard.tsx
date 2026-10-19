import { useEffect, useState, type KeyboardEvent } from "react";
import { authenticatedFetch } from "../../infrastructure/auth/session";
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
      <p className="admin-dashboard-loading" role="status">
        Cargando el panel. Jappy está revisando las cuentas.
      </p>
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
                title="Coste medio por usuario · semana"
                value={USD.format(data.estimatedAiCost.weeklyAveragePerUserUsd)}
              />
              <Metric
                title="Coste medio por usuario · total"
                value={USD.format(data.estimatedAiCost.totalAveragePerUserUsd)}
              />
            </section>
            <p className="admin-dashboard-note">
              El promedio se calcula entre{" "}
              {data.estimatedAiCost.registeredUserCount} cuentas de usuario;
              excluye Jappy y usos sin cuenta. Eventos sin precio configurado:{" "}
              {data.estimatedAiCost.unpricedUsageEvents}.
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
                Se muestran los 100 mensajes más recientes. El envío de
                confirmaciones y respuestas por correo está pendiente.
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

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <article className="admin-metric">
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}
