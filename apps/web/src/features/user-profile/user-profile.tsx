import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../../infrastructure/auth/session";
import { UserDelete } from "../user-delete/user-delete";
import "./user-profile.scss";

type PlanCode = "ILUMINADO" | "FALTON";
type PlanStatus = "active" | "inactive";
type AccountPlan = {
  plan: PlanCode;
  status: PlanStatus;
  startsAt: string | null;
  expiresAt: string | null;
  attemptsRemaining: { ideas: number; roasts: number };
};
type AccountProfile = {
  user: {
    email: string;
    username: string;
    emailVerified: boolean;
    createdAt: string;
  };
  plans: AccountPlan[];
};
type GoodIdea = { id: string; title: string; createdAt: string };

type PlanContent = {
  name: string;
  id: string;
  description: string;
  attempts: (plan: AccountPlan) => string;
};

const PLANS: Record<PlanCode, PlanContent> = {
  ILUMINADO: {
    id: "iluminado",
    name: "Iluminado",
    description: "Evaluaciones de ideas",
    attempts: (plan) =>
      `${plan.attemptsRemaining.ideas} de 11 evaluaciones disponibles hoy`,
  },
  FALTON: {
    id: "falton",
    name: "Faltón",
    description: "Envíos de roast",
    attempts: (plan) =>
      `${plan.attemptsRemaining.roasts} de 11 envíos disponibles hoy`,
  },
};

const PLAN_CODES: PlanCode[] = ["ILUMINADO", "FALTON"];
const PROFILE_LOAD_ERROR =
  "No se ha podido cargar tu perfil. Comprueba la conexión e inténtalo de nuevo.";
const SESSION_REQUIRED_ERROR =
  "Tu sesión no está activa. Entra en tu cuenta para consultar el perfil.";
const CANCELLATION_ERROR =
  "No se ha podido confirmar la baja. Comprueba el estado del plan e inténtalo de nuevo.";
const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  active: "Activo",
  inactive: "No activo",
};
const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeZone: "Europe/Madrid",
});

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isDateOrNull(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)))
  );
}

function isAccountPlan(value: unknown): value is AccountPlan {
  if (!isRecord(value) || !isRecord(value.attemptsRemaining)) return false;
  return (
    (value.plan === "ILUMINADO" || value.plan === "FALTON") &&
    (value.status === "active" || value.status === "inactive") &&
    isDateOrNull(value.startsAt) &&
    isDateOrNull(value.expiresAt) &&
    isNonNegativeInteger(value.attemptsRemaining.ideas) &&
    isNonNegativeInteger(value.attemptsRemaining.roasts)
  );
}

function isAccountProfile(value: unknown): value is AccountProfile {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  const plans = value.plans;
  if (!Array.isArray(plans)) return false;
  return (
    typeof value.user.email === "string" &&
    typeof value.user.username === "string" &&
    typeof value.user.emailVerified === "boolean" &&
    typeof value.user.createdAt === "string" &&
    Number.isFinite(Date.parse(value.user.createdAt)) &&
    plans.length === PLAN_CODES.length &&
    plans.every(isAccountPlan) &&
    PLAN_CODES.every((code) =>
      plans.some((plan) => isAccountPlan(plan) && plan.plan === code),
    )
  );
}

function isGoodIdea(value: unknown): value is GoodIdea {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt))
  );
}

function isGoodIdeasResponse(value: unknown): value is { ideas: GoodIdea[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.ideas) &&
    value.ideas.every(isGoodIdea)
  );
}

function formatDate(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_FORMATTER.format(date) : null;
}

export function UserProfile() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [goodIdeas, setGoodIdeas] = useState<GoodIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [cancellingPlan, setCancellingPlan] = useState<PlanCode | null>(null);
  const [cancellationMessage, setCancellationMessage] = useState("");
  const [cancellationError, setCancellationError] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [profileResponse, ideasResponse] = await Promise.all([
        authenticatedFetch("/api/account/profile"),
        authenticatedFetch("/api/account/good-ideas"),
      ]);
      const [profileBody, ideasBody]: [unknown, unknown] = await Promise.all([
        readJson(profileResponse),
        readJson(ideasResponse),
      ]);
      if (!profileResponse.ok || !ideasResponse.ok) {
        setLoadError(
          profileResponse.status === 401 || ideasResponse.status === 401
            ? SESSION_REQUIRED_ERROR
            : PROFILE_LOAD_ERROR,
        );
        return;
      }
      if (!isAccountProfile(profileBody) || !isGoodIdeasResponse(ideasBody)) {
        setLoadError(PROFILE_LOAD_ERROR);
        return;
      }
      setProfile(profileBody);
      setGoodIdeas(ideasBody.ideas);
    } catch {
      setLoadError(PROFILE_LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function cancelPlan(plan: PlanCode) {
    setCancellingPlan(plan);
    setCancellationError("");
    setCancellationMessage("");
    try {
      const response = await authenticatedFetch(
        "/api/account/subscriptions/cancel",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        },
      );
      const body: unknown = await readJson(response);
      if (!response.ok || !isAccountProfile(body)) {
        setCancellationError(
          response.status === 401 ? SESSION_REQUIRED_ERROR : CANCELLATION_ERROR,
        );
        return;
      }
      const updatedPlan = body.plans.find((item) => item.plan === plan);
      if (!updatedPlan || updatedPlan.status !== "inactive") {
        setCancellationError(CANCELLATION_ERROR);
        return;
      }
      setProfile(body);
      setCancellationMessage(
        `La baja de ${PLANS[plan].name} se ha confirmado. El servidor ya refleja el cambio.`,
      );
    } catch {
      setCancellationError(CANCELLATION_ERROR);
    } finally {
      setCancellingPlan(null);
    }
  }

  if (loading) {
    return (
      <p className="profile-loading" role="status" aria-live="polite">
        Consultando tu cuenta. Hasta una IA gruñona tiene que comprobar los
        datos.
      </p>
    );
  }

  if (loadError || profile === null) {
    return (
      <section
        className="profile-error-card"
        aria-labelledby="profile-error-title"
      >
        <span className="eyebrow">Cuenta no disponible</span>
        <h2 id="profile-error-title">
          No puedo enseñar un perfil que no he podido consultar.
        </h2>
        <p role="alert">{loadError || PROFILE_LOAD_ERROR}</p>
        <div className="profile-error-actions">
          {loadError === SESSION_REQUIRED_ERROR ? (
            <a className="button-primary" href="/login">
              Entrar en mi cuenta
            </a>
          ) : null}
          <button
            className="button-secondary"
            type="button"
            onClick={() => void loadProfile()}
          >
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="profile-page">
      <section
        className="profile-account-card"
        aria-labelledby="profile-account-title"
      >
        <div className="profile-account-heading">
          <div>
            <span className="eyebrow">Tus datos</span>
            <h2 id="profile-account-title">{profile.user.username}</h2>
          </div>
          <span className="profile-avatar" aria-hidden="true">
            {profile.user.username.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <dl className="profile-details">
          <div>
            <dt>Correo electrónico</dt>
            <dd>{profile.user.email}</dd>
          </div>
          <div>
            <dt>En Grumphya desde</dt>
            <dd>
              {formatDate(profile.user.createdAt) ?? "fecha no disponible"}
            </dd>
          </div>
        </dl>
        {!profile.user.emailVerified ? (
          <p className="profile-verification-notice" role="status">
            <strong>Correo sin verificar.</strong> Añadiremos la verificación
            antes de abrir el registro al público.
          </p>
        ) : null}
      </section>

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
        <div className="profile-plans-grid">
          {PLAN_CODES.map((code) => {
            const plan = profile.plans.find((item) => item.plan === code);
            if (!plan) return null;
            const content = PLANS[code];
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
                    className={`profile-plan-status profile-plan-status-${plan.status}`}
                  >
                    {PLAN_STATUS_LABEL[plan.status]}
                  </span>
                </div>
                <p className="profile-plan-allowance">
                  {content.attempts(plan)}
                </p>
                {isActive ? (
                  <>
                    <p className="profile-plan-renewal">
                      Activo desde:{" "}
                      <strong>{startsAt ?? "fecha no disponible"}</strong>
                    </p>
                    <p className="profile-plan-renewal">
                      Vigencia hasta:{" "}
                      <strong>{expiresAt ?? "fecha no disponible"}</strong>
                    </p>
                    <button
                      className="profile-cancel-button"
                      type="button"
                      onClick={() => void cancelPlan(plan.plan)}
                      disabled={cancellingPlan !== null}
                      aria-label={`Darme de baja del plan ${content.name}`}
                    >
                      {cancellingPlan === plan.plan
                        ? "Procesando baja…"
                        : "Darme de baja"}
                    </button>
                  </>
                ) : (
                  <a className="profile-plan-link" href="/precios">
                    Consultar contratación
                  </a>
                )}
              </article>
            );
          })}
        </div>
        {cancellationMessage ? (
          <p className="profile-cancellation-message" role="status">
            {cancellationMessage}
          </p>
        ) : null}
        {cancellationError ? (
          <p className="profile-cancellation-error" role="alert">
            {cancellationError}
          </p>
        ) : null}
      </section>

      <section
        className="profile-ideas-card"
        aria-labelledby="profile-ideas-title"
      >
        <div className="profile-section-heading">
          <div>
            <span className="eyebrow">Las que sobrevivieron al análisis</span>
            <h2 id="profile-ideas-title">Tus últimas ideas aprobadas</h2>
          </div>
          <span className="profile-ideas-count">
            {goodIdeas.length} {goodIdeas.length === 1 ? "idea" : "ideas"}
          </span>
        </div>
        {goodIdeas.length > 0 ? (
          <>
            <p className="profile-ideas-intro">
              Aquí tienes tus ideas aprobadas, con su título y fecha.
            </p>
            <div className="profile-table-wrap">
              <table className="profile-ideas-table">
                <caption className="sr-only">
                  Últimas ideas aprobadas de la cuenta
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Idea</th>
                    <th scope="col">Fecha de aprobación</th>
                  </tr>
                </thead>
                <tbody>
                  {goodIdeas.map((idea) => (
                    <tr key={idea.id}>
                      <th scope="row">{idea.title}</th>
                      <td>
                        <time dateTime={idea.createdAt}>
                          {formatDate(idea.createdAt) ?? "fecha no disponible"}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="profile-ideas-intro">
            Todavía no tienes ideas aprobadas guardadas en tu perfil.
          </p>
        )}
      </section>
      <UserDelete />
    </div>
  );
}
