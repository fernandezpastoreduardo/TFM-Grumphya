import type { AccountProfile, PlanCode } from "../user-profile.models";
import {
  PLAN_CODES,
  PLANS,
  PLAN_STATUS_LABEL,
} from "../user-profile.constants";
import { formatDate } from "../user-profile.formatters";

type ProfilePlansSectionProps = {
  profile: AccountProfile;
  purchasingPlan: PlanCode | null;
  paymentPlan: PlanCode | null;
  purchaseError: string;
  onPurchasePlan: (plan: PlanCode) => void;
};

export function ProfilePlansSection({
  profile,
  purchasingPlan,
  paymentPlan,
  purchaseError,
  onPurchasePlan,
}: ProfilePlansSectionProps) {
  return (
    <section
      className="profile-plans-section"
      aria-labelledby="profile-plans-title"
    >
      <div className="profile-section-heading">
        <div>
          <span className="eyebrow">Lo que tienes entre manos</span>
          <h2 id="profile-plans-title">Tus planes</h2>
        </div>
        <a className="button-secondary" href="/precios">
          Ver planes <span aria-hidden="true">↗</span>
        </a>
      </div>
      <p className="profile-renewal-note">
        Cada plan dura un mes y no se renueva automáticamente. Si otro mes te
        apetece café, vuelves y lo contratas; no tendrás que cancelar nada.
      </p>
      <div className="profile-plans-grid">
        {PLAN_CODES.map((code) => {
          const plan = profile.plans.find((item) => item.plan === code);
          if (!plan) return null;
          const content = PLANS[code];
          const isJappyAdmin =
            profile.user.role === "admin" &&
            profile.user.username.toLocaleLowerCase("es-ES") === "jappy";
          const isActive = plan.status === "active";
          const startsAt = formatDate(plan.startsAt);
          const expiresAt = formatDate(plan.expiresAt);
          return (
            <article
              className={`profile-plan-card profile-plan-${content.id}`}
              key={plan.plan}
            >
              <div className="profile-plan-topline">
                <div>
                  <h3>{content.name}</h3>
                  <p>{content.description}</p>
                </div>
                <span
                  className={`profile-plan-status profile-plan-status-${isJappyAdmin ? "active" : plan.status}`}
                >
                  {isJappyAdmin ? "Ilimitado" : PLAN_STATUS_LABEL[plan.status]}
                </span>
              </div>
              <p className="profile-plan-allowance">
                {isJappyAdmin
                  ? "Acceso ilimitado para esta cuenta."
                  : content.attempts(plan)}
              </p>
              {!isJappyAdmin && isActive ? (
                <>
                  <p className="profile-plan-renewal">
                    Activo desde:{" "}
                    <strong>{startsAt ?? "fecha no disponible"}</strong>
                  </p>
                  <p className="profile-plan-renewal">
                    Vigencia hasta:{" "}
                    <strong>{expiresAt ?? "fecha no disponible"}</strong>
                  </p>
                </>
              ) : null}
              {!isJappyAdmin && !isActive ? (
                <button
                  className="profile-plan-link"
                  type="button"
                  disabled={purchasingPlan !== null || paymentPlan !== null}
                  onClick={() => void onPurchasePlan(plan.plan)}
                >
                  {purchasingPlan === plan.plan
                    ? "Preparando el café…"
                    : "Pagar un café"}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
      {purchaseError ? (
        <p className="profile-purchase-error" role="alert">
          {purchaseError}
        </p>
      ) : null}
    </section>
  );
}
