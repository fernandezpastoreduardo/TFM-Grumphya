import { useCallback, useEffect, useRef, useState } from "react";
import {
  authenticatedFetch,
  USER_AVATAR_UPDATED_EVENT,
} from "../../infrastructure/auth/session";
import { isPublicAvatarUrl } from "../../infrastructure/avatar/public-avatar-url";
import { AvatarEditorDialog } from "./components/AvatarEditorDialog";
import { PaymentSimulationDialog } from "../register-with-plan/components/PaymentSimulationDialog";
import { UserDelete } from "../user-delete/user-delete";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
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
    role: "user" | "admin";
    email: string;
    username: string;
    emailVerified: boolean;
    createdAt: string;
    publicRankingsOptIn: boolean;
    avatarUrl?: string | null;
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
const PURCHASE_ERROR =
  "No se ha podido activar el plan. Comprueba la conexión e inténtalo de nuevo.";
const AVATAR_UPLOAD_ERROR =
  "No se ha podido actualizar el avatar. Comprueba la imagen e inténtalo de nuevo.";
const RANKING_PREFERENCE_ERROR =
  "No se ha podido guardar tu preferencia de privacidad. Inténtalo de nuevo.";
const PLAN_ALREADY_ACTIVE_ERROR =
  "Ese plan ya está activo; guárdate el café para más adelante.";
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
    (value.user.role === "user" || value.user.role === "admin") &&
    typeof value.user.emailVerified === "boolean" &&
    typeof value.user.publicRankingsOptIn === "boolean" &&
    typeof value.user.createdAt === "string" &&
    Number.isFinite(Date.parse(value.user.createdAt)) &&
    (value.user.avatarUrl === undefined ||
      value.user.avatarUrl === null ||
      isPublicAvatarUrl(value.user.avatarUrl)) &&
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
  const [purchasingPlan, setPurchasingPlan] = useState<PlanCode | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<PlanCode | null>(null);
  const [purchaseError, setPurchaseError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [rankingPreferenceError, setRankingPreferenceError] = useState("");
  const [rankingPreferenceSaving, setRankingPreferenceSaving] = useState(false);
  const purchaseKeyRef = useRef<string | null>(null);

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

  async function purchasePlan(plan: PlanCode) {
    setPurchasingPlan(plan);
    setPurchaseError("");
    purchaseKeyRef.current ??= crypto.randomUUID();
    try {
      const response = await authenticatedFetch(
        "/api/account/subscriptions/purchase",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": purchaseKeyRef.current,
          },
          body: JSON.stringify({ plan }),
        },
      );
      const body: unknown = await readJson(response);
      if (!response.ok || !isAccountProfile(body)) {
        setPurchaseError(
          response.status === 401
            ? SESSION_REQUIRED_ERROR
            : response.status === 409
              ? PLAN_ALREADY_ACTIVE_ERROR
              : PURCHASE_ERROR,
        );
        return;
      }
      const updatedPlan = body.plans.find((item) => item.plan === plan);
      if (!updatedPlan || updatedPlan.status !== "active") {
        setPurchaseError(PURCHASE_ERROR);
        return;
      }
      purchaseKeyRef.current = null;
      setProfile(body);
      setPaymentPlan(plan);
    } catch {
      setPurchaseError(PURCHASE_ERROR);
    } finally {
      setPurchasingPlan(null);
    }
  }

  function finishPurchaseSimulation() {
    setPaymentPlan(null);
    void loadProfile();
  }

  async function uploadAvatar(file: File): Promise<boolean> {
    setAvatarError("");
    setAvatarUploading(true);
    const form = new FormData();
    form.append("avatar", file);
    try {
      const response = await authenticatedFetch("/api/account/avatar", {
        method: "POST",
        body: form,
      });
      const body: unknown = await readJson(response);
      if (
        !response.ok ||
        !isRecord(body) ||
        typeof body.avatarUrl !== "string" ||
        !isPublicAvatarUrl(body.avatarUrl)
      ) {
        setAvatarError(
          response.status < 500 &&
            isRecord(body) &&
            typeof body.message === "string"
            ? body.message
            : AVATAR_UPLOAD_ERROR,
        );
        return false;
      }
      const nextAvatarUrl = body.avatarUrl;
      setProfile((current) =>
        current
          ? { ...current, user: { ...current.user, avatarUrl: nextAvatarUrl } }
          : current,
      );
      window.dispatchEvent(
        new CustomEvent(USER_AVATAR_UPDATED_EVENT, { detail: nextAvatarUrl }),
      );
      return true;
    } catch {
      setAvatarError(AVATAR_UPLOAD_ERROR);
      return false;
    } finally {
      setAvatarUploading(false);
    }
  }

  async function updateRankingPreference(enabled: boolean) {
    setRankingPreferenceSaving(true);
    setRankingPreferenceError("");
    try {
      const response = await authenticatedFetch(
        "/api/account/privacy/rankings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        },
      );
      const body: unknown = await readJson(response);
      if (!response.ok || !isAccountProfile(body)) {
        setRankingPreferenceError(
          response.status === 401
            ? SESSION_REQUIRED_ERROR
            : RANKING_PREFERENCE_ERROR,
        );
        return;
      }
      setProfile(body);
    } catch {
      setRankingPreferenceError(RANKING_PREFERENCE_ERROR);
    } finally {
      setRankingPreferenceSaving(false);
    }
  }

  if (loading) {
    return (
      <LoadingSkeleton
        label="Consultando tu cuenta"
        className="profile-loading-skeleton"
      >
        <div className="profile-account-card profile-account-skeleton">
          <div className="profile-account-heading">
            <div className="profile-skeleton-identity">
              <SkeletonBlock className="skeleton-profile-eyebrow" />
              <SkeletonBlock className="skeleton-profile-title" />
            </div>
            <SkeletonBlock className="skeleton-profile-avatar" />
          </div>
          <SkeletonBlock className="skeleton-profile-detail" />
          <SkeletonBlock className="skeleton-profile-detail short" />
          <div className="profile-skeleton-plans">
            <SkeletonBlock className="skeleton-profile-plan" />
            <SkeletonBlock className="skeleton-profile-plan" />
          </div>
        </div>
        <div className="profile-ideas-card profile-ideas-skeleton">
          <SkeletonBlock className="skeleton-profile-title" />
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonBlock className="skeleton-profile-idea" key={index} />
          ))}
        </div>
      </LoadingSkeleton>
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
          <div className="profile-avatar-edit">
            {profile.user.avatarUrl ? (
              <img
                className="profile-avatar"
                src={profile.user.avatarUrl}
                alt={`Avatar de ${profile.user.username}`}
              />
            ) : (
              <span className="profile-avatar" aria-hidden="true">
                {profile.user.username.slice(0, 1).toUpperCase()}
              </span>
            )}
            <button
              className="profile-avatar-edit-button"
              type="button"
              aria-label="Editar avatar"
              onClick={() => {
                setAvatarError("");
                setAvatarEditorOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m14.7 6.3 3 3M4 20l4.2-.9L19 7.3a2.1 2.1 0 0 0-3-3L5.2 15.1 4 20Z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="profile-avatar-control">
          <small>
            Un retrato redondo que aparecerá junto a tu nombre en perfil y
            rankings.
          </small>
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
        <div className="profile-ranking-consent">
          <label>
            <input
              type="checkbox"
              checked={profile.user.publicRankingsOptIn}
              disabled={rankingPreferenceSaving}
              onChange={(event) =>
                void updateRankingPreference(event.currentTarget.checked)
              }
            />
            Quiero aparecer en los rankings públicos con mi alias, mis
            cantidades y, si he elegido uno, mi avatar.
          </label>
          <p>
            Es opcional. Puedes retirar esta autorización aquí cuando quieras.
          </p>
          {rankingPreferenceError ? (
            <p role="alert">{rankingPreferenceError}</p>
          ) : null}
          {rankingPreferenceSaving ? (
            <p role="status">Guardando tu preferencia…</p>
          ) : null}
        </div>
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
                    {isJappyAdmin
                      ? "Ilimitado"
                      : PLAN_STATUS_LABEL[plan.status]}
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
                    onClick={() => void purchasePlan(plan.plan)}
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
      {avatarEditorOpen ? (
        <AvatarEditorDialog
          avatarUrl={profile.user.avatarUrl}
          username={profile.user.username}
          uploading={avatarUploading}
          uploadError={avatarError}
          onClose={() => setAvatarEditorOpen(false)}
          onUpload={uploadAvatar}
        />
      ) : null}
      <PaymentSimulationDialog
        open={paymentPlan !== null}
        heading={
          paymentPlan === null
            ? undefined
            : `Estoy activando tu plan ${PLANS[paymentPlan].name}.`
        }
        onComplete={finishPurchaseSimulation}
      />
    </div>
  );
}
