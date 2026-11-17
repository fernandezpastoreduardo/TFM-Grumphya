import type { AiCostByActor, MaximumPlanCost } from "../admin-dashboard.models";
import { EUR_COST, EUR_PER_ATTEMPT } from "../admin-dashboard-formatters";

export function CostBreakdown({
  title,
  costs,
  usdToEurRate,
}: {
  title: string;
  costs: AiCostByActor;
  usdToEurRate: number;
}) {
  return (
    <div className="admin-cost-breakdown">
      <h3>{title}</h3>
      <dl>
        <div>
          <dt>Cuentas de usuario</dt>
          <dd>{EUR_COST.format(costs.registeredUsersUsd * usdToEurRate)}</dd>
        </div>
        <div>
          <dt>Jappy · admin</dt>
          <dd>{EUR_COST.format(costs.adminsUsd * usdToEurRate)}</dd>
        </div>
        <div>
          <dt>Visitantes sin cuenta</dt>
          <dd>{EUR_COST.format(costs.anonymousUsd * usdToEurRate)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function MaximumCostMetric({
  title,
  cost,
  usdToEurRate,
}: {
  title: string;
  cost: MaximumPlanCost;
  usdToEurRate: number;
}) {
  return (
    <article className="admin-metric admin-maximum-cost">
      <h3>{title}</h3>
      <p>
        {cost.monthlyMaximumUsd === null
          ? "Sin usos con precio registrado"
          : EUR_COST.format(cost.monthlyMaximumUsd * usdToEurRate)}
      </p>
      <small>
        {cost.pricedAttempts} usos con precio · media por intento:{" "}
        {cost.averagePerAttemptUsd === null
          ? "sin datos"
          : EUR_PER_ATTEMPT.format(cost.averagePerAttemptUsd * usdToEurRate)}
      </small>
    </article>
  );
}

export function Metric({ title, value }: { title: string; value: string }) {
  return (
    <article className="admin-metric">
      <h3>{title}</h3>
      <p>{value}</p>
    </article>
  );
}
