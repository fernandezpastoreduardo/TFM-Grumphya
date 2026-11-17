import type { DashboardData } from "../admin-dashboard.models";
import { DATE, EUR_COST } from "../admin-dashboard-formatters";
import {
  getAiOperationLabel,
  getTokenVolumeLabel,
} from "../admin-dashboard.validation";
import { Metric } from "../components/admin-dashboard-charts";

export function BenchmarkTab() {
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
      <p>No hay ningún informe de benchmark guardado en este momento.</p>
      <p>El informe sintético incluiría:</p>
      <ul>
        <li>Versión de la política y fecha de generación.</li>
        <li>Número de casos y variantes evaluadas.</li>
        <li>
          Acuerdo con las decisiones esperadas, en recuento y porcentaje, por
          variante.
        </li>
        <li>
          Recuento de casos con acuerdo de estado y de motivo entre variantes.
        </li>
        <li>Confirmación de que solo se emiten resultados agregados.</li>
      </ul>
      <p className="admin-dashboard-note">
        No se ha ejecutado un benchmark desde este panel. El informe no incluye
        ideas ni explicaciones de los modelos.
      </p>
    </section>
  );
}

export function TelemetryTab({ data }: { data: DashboardData }) {
  return (
    <section
      className="admin-dashboard-card"
      aria-labelledby="admin-telemetry-title"
    >
      <h2 id="admin-telemetry-title">Telemetría de operaciones de IA</h2>
      <p>
        Actividad agregada de las últimas 24 horas, agrupada por hora, operación
        y modelo. El coste estimado se convierte a euros con la referencia del
        BCE indicada en finanzas.
      </p>
      <div className="admin-metrics">
        <Metric
          title="Coste estimado · esta semana"
          value={EUR_COST.format(
            data.estimatedAiCost.weeklyUsd * data.annualFinance.usdToEurRate,
          )}
        />
        <Metric
          title="Coste estimado · total"
          value={EUR_COST.format(
            data.estimatedAiCost.totalUsd * data.annualFinance.usdToEurRate,
          )}
        />
        <Metric
          title="Eventos sin precio configurado"
          value={String(data.estimatedAiCost.unpricedUsageEvents)}
        />
      </div>
      <section aria-labelledby="admin-recent-ai-activity-title">
        <h3 id="admin-recent-ai-activity-title">Actividad reciente de IA</h3>
        {data.recentAiActivity.length > 0 ? (
          <div className="admin-table-scroll">
            <table aria-label="Actividad reciente agregada de IA">
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Operación</th>
                  <th scope="col">Modelo</th>
                  <th scope="col">Usos</th>
                  <th scope="col">Volumen de entrada</th>
                  <th scope="col">Volumen cacheado</th>
                  <th scope="col">Volumen de salida</th>
                  <th scope="col">Coste estimado</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAiActivity.map((activity) => (
                  <tr
                    key={`${activity.hour}:${activity.operation}:${activity.model}`}
                  >
                    <td>
                      <time dateTime={activity.hour}>
                        {DATE.format(new Date(activity.hour))}
                      </time>
                    </td>
                    <td>{getAiOperationLabel(activity.operation)}</td>
                    <td>{activity.model}</td>
                    <td>{activity.eventCount}</td>
                    <td>{getTokenVolumeLabel(activity.inputTokenBucket)}</td>
                    <td>
                      {getTokenVolumeLabel(activity.cachedInputTokenBucket)}
                    </td>
                    <td>{getTokenVolumeLabel(activity.outputTokenBucket)}</td>
                    <td>
                      {activity.estimatedCostUsd === null
                        ? "Sin precio configurado"
                        : EUR_COST.format(
                            activity.estimatedCostUsd *
                              data.annualFinance.usdToEurRate,
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No hay grupos de tres o más usos en las últimas 24 horas.</p>
        )}
      </section>
      <p className="admin-dashboard-note">
        Solo se muestran grupos de tres o más usos y el volumen de tokens en
        rangos. No aparecen ideas, cuentas, direcciones IP, sesiones ni
        identificadores individuales.
      </p>
    </section>
  );
}

export function SecurityTab({ data }: { data: DashboardData }) {
  const metrics = data.loginSecurity;
  return (
    <section
      className="admin-dashboard-card"
      aria-labelledby="admin-security-title"
    >
      <h2 id="admin-security-title">Actividad de acceso y protección</h2>
      <p>Métricas agregadas de los últimos {metrics.windowMinutes} minutos.</p>
      <div className="admin-metrics" aria-label="Métricas agregadas de acceso">
        <Metric
          title="Solicitudes de acceso"
          value={String(metrics.loginRequests)}
        />
        <Metric
          title="Desafíos emitidos"
          value={String(metrics.challengesIssued)}
        />
        <Metric
          title="Desafíos aceptados"
          value={String(metrics.challengesAccepted)}
        />
        <Metric
          title="Desafíos rechazados"
          value={String(metrics.challengesRejected)}
        />
        <Metric
          title="Inicios de sesión fallidos"
          value={String(metrics.failedLogins)}
        />
        <Metric
          title="Solicitudes bloqueadas"
          value={String(metrics.blockedRequests)}
        />
        <Metric
          title="Direcciones bloqueadas activas"
          value={String(metrics.activeBlockedAddresses)}
        />
        <Metric
          title="Modo de ataque"
          value={metrics.attackModeActive ? "Activo" : "Inactivo"}
        />
      </div>
      <p className="admin-dashboard-note">
        Contadores volátiles en memoria; se reinician al reiniciarse el proceso.
        Son agregados y no muestran direcciones IP, cuentas ni sesiones, ni
        conservan un historial individual de inicios de sesión.
      </p>
      <h3>Pruebas de seguridad cubiertas</h3>
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
