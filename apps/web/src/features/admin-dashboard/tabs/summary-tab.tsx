import { AdminContactMessageReply } from "../admin-contact-message-reply";
import type {
  AdminContactMessage,
  DashboardData,
} from "../admin-dashboard.models";
import { DATE, EUR, EUR_COST } from "../admin-dashboard-formatters";
import {
  ActivePlansChart,
  AiCostChart,
  AnnualFinanceChart,
  CostBreakdown,
  MaximumCostMetric,
  Metric,
} from "../components/admin-dashboard-charts";
import { getApplicationErrorLabel } from "../application-error-labels";

export function SummaryTab({
  data,
  messages,
}: {
  data: DashboardData;
  messages: AdminContactMessage[];
}) {
  return (
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
          title="Coste IA estimado · esta semana"
          value={EUR_COST.format(
            data.estimatedAiCost.weeklyUsd * data.annualFinance.usdToEurRate,
          )}
        />
        <Metric
          title="Coste IA estimado · total"
          value={EUR_COST.format(
            data.estimatedAiCost.totalUsd * data.annualFinance.usdToEurRate,
          )}
        />
        <Metric
          title="Coste medio estimado por cuenta · semana"
          value={EUR_COST.format(
            data.estimatedAiCost.weeklyAveragePerAccountUsd *
              data.annualFinance.usdToEurRate,
          )}
        />
        <Metric
          title="Coste medio estimado por cuenta · total"
          value={EUR_COST.format(
            data.estimatedAiCost.totalAveragePerAccountUsd *
              data.annualFinance.usdToEurRate,
          )}
        />
        <MaximumCostMetric
          title="Coste máximo iluminado"
          cost={data.maximumMonthlyCost.iluminado}
          usdToEurRate={data.annualFinance.usdToEurRate}
        />
        <MaximumCostMetric
          title="Coste máximo faltón"
          cost={data.maximumMonthlyCost.falton}
          usdToEurRate={data.annualFinance.usdToEurRate}
        />
      </section>
      <p className="admin-dashboard-note admin-maximum-cost-note">
        Máximo estimado por cuenta: coste medio de entrada y salida de cada
        operación con precio × {data.maximumMonthlyCost.dailyAttempts} intentos
        al día × {data.maximumMonthlyCost.assumedDaysPerMonth} días de media al
        mes. Solo se cuentan evaluaciones de ideas para Iluminado y mensajes de
        roast para Faltón; otras operaciones de IA quedan fuera de este cálculo.
      </p>
      <p className="admin-dashboard-note admin-ai-cost-note">
        El coste medio por cuenta incluye a usuarios registrados y admins
        activos ({data.estimatedAiCost.activeRegisteredAccountCount} y{" "}
        {data.estimatedAiCost.activeAdminAccountCount}, respectivamente). Los
        usos sin cuenta también forman parte del gasto total y se muestran
        aparte. Eventos sin precio configurado:{" "}
        {data.estimatedAiCost.unpricedUsageEvents}. Los eventos anteriores a
        registrar tokens cacheados no se pueden recalcular con exactitud; el
        total es una estimación de uso, no la factura de OpenAI.
      </p>
      <section
        className="admin-dashboard-card admin-ai-costs"
        aria-labelledby="admin-ai-costs-title"
      >
        <div className="admin-dashboard-section-heading">
          <div>
            <span className="eyebrow">Costes estimados de IA · EUR</span>
            <h2 id="admin-ai-costs-title">Quién genera el coste</h2>
          </div>
        </div>
        <CostBreakdown
          title="Esta semana"
          costs={data.estimatedAiCost.weeklyByActor}
          usdToEurRate={data.annualFinance.usdToEurRate}
        />
        <CostBreakdown
          title="Acumulado"
          costs={data.estimatedAiCost.totalByActor}
          usdToEurRate={data.annualFinance.usdToEurRate}
        />
        <div className="admin-chart-pair">
          <ActivePlansChart weeks={data.weeklyActivePlans} />
          <AiCostChart
            weeks={data.estimatedAiCost.weeklyTrend}
            usdToEurRate={data.annualFinance.usdToEurRate}
          />
        </div>
      </section>
      <AnnualFinanceChart finance={data.annualFinance} />
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
                    key={[
                      error.code,
                      error.latestDiagnosticCode ?? "none",
                    ].join(":")}
                  >
                    <th scope="row">
                      <a
                        href={
                          "/panel-control?error=" +
                          encodeURIComponent(error.latestEventId)
                        }
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
          <span>{messages.length}</span>
        </div>
        {messages.length ? (
          <div className="admin-contact-list">
            {messages.map((contact) => (
              <article className="admin-contact" key={contact.id}>
                <div className="admin-contact-heading">
                  <div>
                    <h3>{contact.subject}</h3>
                    <p>
                      {contact.sender.username} ·{" "}
                      <a
                        href={
                          "mailto:" + encodeURIComponent(contact.sender.email)
                        }
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
          Se muestran los 100 mensajes más recientes. Las respuestas se envían
          desde el buzón de IONOS; las respuestas recibidas se consultan en el
          webmail y no se leen desde esta aplicación. Si un envío queda sin
          confirmar, revisa el webmail antes de autorizar un reintento.
        </p>
      </section>
    </>
  );
}
