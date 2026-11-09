import { lazy, Suspense } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import {
  SectionPageFrame,
  type SectionPageMeta,
} from "../shared/components/section-page-frame";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../shared/components/loading-skeleton";
import { ErrorPages } from "../features/error-pages/error-pages";
import { ACCREDITATION_VERIFICATION_URL } from "../shared/accreditation-verification";

type SectionPageDefinition = {
  meta: SectionPageMeta;
  load: () => Promise<{ default: ComponentType }>;
};

const loadPricingPage = () =>
  import("../features/pricing/pricing").then((module) => ({
    default: module.Pricing,
  }));

const SECTION_PAGES: Record<string, SectionPageDefinition> = {
  [ACCREDITATION_VERIFICATION_URL]: {
    meta: {
      title: "Ficha pública de revisión interna",
      intro:
        "Consulta la ficha de Grumphya y comprueba qué dominio figura para esta demostración académica.",
      theme: "calm",
    },
    load: () =>
      import("../features/accreditation-verification/accreditation-verification").then(
        (module) => ({ default: module.AccreditationVerification }),
      ),
  },
  "/lo-peor-de-lo-peor": {
    meta: {
      title: "El muro de la vergüenza",
      intro:
        "Una pequeña clasificación de ocurrencias que se han ganado una pausa y una conversación seria.",
      theme: "rose",
      mascot: "worst-ideas",
    },
    load: () =>
      import("../features/worst-ideas/worst-ideas").then((module) => ({
        default: module.WorstIdeas,
      })),
  },
  "/descargate": {
    meta: {
      title: "Descárgate a gusto",
      intro:
        "Suelta el insulto. Yo pongo la cara de haber leído cosas peores. Probablemente.",
      theme: "blue",
      mascot: "roast",
    },
    load: () =>
      import("../features/roast/roast").then((module) => ({
        default: module.Roast,
      })),
  },
  "/humanos-notables": {
    meta: {
      title: "Humanos notables",
      intro:
        "Un aplauso para quien ha traído una idea con algo más que optimismo y una presentación bonita.",
      theme: "mint",
      mascot: "notable-humans",
    },
    load: () =>
      import("../features/notable-humans/notable-humans").then((module) => ({
        default: module.NotableHumans,
      })),
  },
  "/buenas-practicas": {
    meta: {
      title: "Primero el problema. Luego el código.",
      intro:
        "Validar una necesidad antes de construir ayuda a cuidar el tiempo, el presupuesto y la energía del equipo.",
      theme: "calm",
      mascot: "good-practices",
    },
    load: () =>
      import("../features/good-practices/good-practices").then((module) => ({
        default: module.GoodPractices,
      })),
  },
  "/precios": {
    meta: {
      title: "Once usos. Sí, once.",
      intro:
        "Elige qué quieres poner a prueba. La compra todavía es una simulación: aquí no se mueve dinero.",
      theme: "blue",
      mascot: "plans",
    },
    load: loadPricingPage,
  },
  "/crear-cuenta/planes": {
    meta: {
      title: "Para crear tu cuenta, primero elige un plan",
      intro:
        "Selecciona Iluminado o Faltón para continuar con el alta. La contratación de esta versión es simulada: aquí no se mueve dinero.",
      theme: "blue",
      mascot: "plans",
    },
    load: loadPricingPage,
  },
  "/contacto": {
    meta: {
      title: "¿Necesitas decirlo en voz alta?",
      intro:
        "El formulario existe. Mi interés por recibirlo está en fase de evaluación.",
      theme: "rose",
      mascot: "contact",
    },
    load: () =>
      import("../features/contact/contact").then((module) => ({
        default: module.Contact,
      })),
  },
  "/login": {
    meta: {
      title: "Ah, has vuelto.",
      intro:
        "Entra para consultar tu historial y el estado real de tu plan. La nostalgia es opcional.",
      theme: "mint",
      mascot: "login",
    },
    load: () =>
      import("../features/authentication/authentication-page").then(
        (module) => ({ default: module.AuthenticationPage }),
      ),
  },
  "/crear-cuenta": {
    meta: {
      title: "Una cuenta. Un plan. Sin letra pequeña de película.",
      intro:
        "La contratación de esta versión es simulada. No introduzcas datos bancarios porque no hacen falta.",
      theme: "blue",
      mascot: "register",
    },
    load: () =>
      import("../features/register-with-plan/register-with-plan").then(
        (module) => ({ default: module.RegisterWithPlan }),
      ),
  },
  "/perfil": {
    meta: {
      title: "Tu cuenta. Tus planes. Tus intentos.",
      intro: "Aquí tienes tus planes, tu actividad y los datos de tu cuenta.",
      theme: "mint",
      mascot: "profile",
    },
    load: () =>
      import("../features/user-profile/user-profile").then((module) => ({
        default: module.UserProfile,
      })),
  },
  "/panel-control": {
    meta: {
      title: "Panel de control",
      intro:
        "Ingresos simulados, costes estimados y señales operativas. Sin hacer como que esto ya es una multinacional.",
      theme: "calm",
      mascot: "admin",
    },
    load: () =>
      import("../features/admin-dashboard/admin-dashboard").then((module) => ({
        default: module.AdminDashboard,
      })),
  },
  "/recuperar-contrasena": {
    meta: {
      title: "¿La contraseña se ha ido de paseo?",
      intro:
        "Solicita un enlace de un solo uso. No confirmaremos si existe una cuenta con ese correo.",
      theme: "mint",
      mascot: "login",
    },
    load: () =>
      import("../features/password-reset/password-reset").then((module) => ({
        default: module.PasswordReset,
      })),
  },
  "/restablecer-contrasena": {
    meta: {
      title: "Una contraseña nueva",
      intro: "El enlace caduca pronto y solo se puede usar una vez.",
      theme: "mint",
      mascot: "login",
    },
    load: () =>
      import("../features/password-reset/password-reset").then((module) => ({
        default: module.PasswordReset,
      })),
  },
  "/verificar-cuenta": {
    meta: {
      title: "Una última comprobación",
      intro:
        "Validamos el enlace. Después decidirás si confirmas la contratación simulada.",
      theme: "mint",
    },
    load: () =>
      import("../features/register-with-plan/registration-verification").then(
        (module) => ({ default: module.RegistrationVerification }),
      ),
  },
  "/politica-de-privacidad": {
    meta: {
      title: "Política de privacidad",
      intro:
        "Qué datos trata Grumphya, para qué los usa y qué información falta por confirmar.",
      theme: "calm",
    },
    load: () =>
      import("../features/register-with-plan/privacy-policy").then(
        (module) => ({
          default: module.PrivacyPolicy,
        }),
      ),
  },
  "/terminos-y-condiciones": {
    meta: {
      title: "Términos y condiciones",
      intro: "Cómo funciona Grumphya y qué ocurre con las ideas que compartes.",
      theme: "calm",
    },
    load: () =>
      import("../features/register-with-plan/terms-and-conditions").then(
        (module) => ({ default: module.TermsAndConditions }),
      ),
  },
};

const SECTION_CONTENT_BY_PATH: Record<
  string,
  LazyExoticComponent<ComponentType>
> = Object.fromEntries(
  Object.entries(SECTION_PAGES).map(([path, section]) => [
    path,
    lazy(section.load),
  ]),
);

const DEFAULT_SECTION_CONTENT = lazy(() =>
  import("../features/authentication/authentication-page").then((module) => ({
    default: module.AuthenticationPage,
  })),
);

function SectionContent({ path }: { path: string }) {
  const Content = SECTION_CONTENT_BY_PATH[path] ?? DEFAULT_SECTION_CONTENT;
  return (
    <Suspense
      fallback={
        <LoadingSkeleton
          label="Preparando esta sección"
          className="section-content-skeleton"
        >
          <SkeletonBlock className="skeleton-section-eyebrow" />
          <SkeletonBlock className="skeleton-section-heading" />
          <SkeletonBlock className="skeleton-section-copy" />
          <div className="skeleton-section-panels">
            <SkeletonBlock className="skeleton-section-panel main" />
            <SkeletonBlock className="skeleton-section-panel side" />
          </div>
        </LoadingSkeleton>
      }
    >
      <Content />
    </Suspense>
  );
}

export function SectionPage({ path }: { path: string }) {
  const page = SECTION_PAGES[path]?.meta;
  if (!page) return <ErrorPages status="404" />;
  return (
    <SectionPageFrame page={page} currentPath={path}>
      <SectionContent path={path} />
    </SectionPageFrame>
  );
}
