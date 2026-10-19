import { lazy, Suspense } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import {
  SectionPageFrame,
  type SectionPageMeta,
} from "../shared/components/section-page-frame";
import { ErrorPages } from "../features/error-pages/error-pages";

const PAGE_META: Record<string, SectionPageMeta> = {
  "/lo-peor-de-lo-peor": {
    title: "El muro de la vergüenza",
    intro:
      "Una pequeña clasificación de ocurrencias que se han ganado una pausa y una conversación seria.",
    theme: "rose",
    mascot: "worst-ideas",
  },
  "/descargate": {
    title: "Descárgate a gusto",
    intro:
      "Suelta el insulto. Yo pongo la cara de haber leído cosas peores. Probablemente.",
    theme: "blue",
    mascot: "roast",
  },
  "/humanos-notables": {
    title: "Humanos notables",
    intro:
      "Un aplauso para quien ha traído una idea con algo más que optimismo y una presentación bonita.",
    theme: "mint",
    mascot: "notable-humans",
  },
  "/buenas-practicas": {
    title: "Primero el problema. Luego el código.",
    intro:
      "Validar una necesidad antes de construir ayuda a cuidar el tiempo, el presupuesto y la energía del equipo.",
    theme: "calm",
    mascot: "good-practices",
  },
  "/precios": {
    title: "Once usos. Sí, once.",
    intro:
      "Elige qué quieres poner a prueba. La compra todavía es una simulación: aquí no se mueve dinero.",
    theme: "blue",
    mascot: "plans",
  },
  "/contacto": {
    title: "¿Necesitas decirlo en voz alta?",
    intro:
      "El formulario existe. Mi interés por recibirlo está en fase de evaluación.",
    theme: "rose",
    mascot: "contact",
  },
  "/login": {
    title: "Ah, has vuelto.",
    intro:
      "Entra para consultar tu historial y el estado real de tu plan. La nostalgia es opcional.",
    theme: "mint",
    mascot: "login",
  },
  "/crear-cuenta": {
    title: "Una cuenta. Un plan. Sin letra pequeña de película.",
    intro:
      "La contratación de esta versión es simulada. No introduzcas datos bancarios porque no hacen falta.",
    theme: "blue",
    mascot: "register",
  },
  "/perfil": {
    title: "Tu cuenta. Tus planes. Tus intentos.",
    intro:
      "Aquí tienes el estado de tu contratación simulada y tus datos. La cuenta ya está activa; el correo todavía está pendiente de verificación.",
    theme: "mint",
    mascot: "profile",
  },
  "/verificar-cuenta": {
    title: "Una última comprobación",
    intro:
      "Validamos el enlace. Después decidirás si confirmas la contratación simulada.",
    theme: "mint",
  },
  "/politica-de-privacidad": {
    title: "Política de privacidad",
    intro:
      "La información de privacidad se completará antes de abrir el registro al público.",
    theme: "calm",
  },
  "/terminos-y-condiciones": {
    title: "Términos y condiciones",
    intro:
      "Cómo funciona Grumphya y qué ocurre con las ideas que compartes.",
    theme: "calm",
  },
};

const SECTION_CONTENT_BY_PATH: Record<
  string,
  LazyExoticComponent<ComponentType>
> = {
  "/lo-peor-de-lo-peor": lazy(() =>
    import("../features/worst-ideas/worst-ideas").then((module) => ({
      default: module.WorstIdeas,
    })),
  ),
  "/descargate": lazy(() =>
    import("../features/roast/roast").then((module) => ({
      default: module.Roast,
    })),
  ),
  "/humanos-notables": lazy(() =>
    import("../features/notable-humans/notable-humans").then((module) => ({
      default: module.NotableHumans,
    })),
  ),
  "/buenas-practicas": lazy(() =>
    import("../features/good-practices/good-practices").then((module) => ({
      default: module.GoodPractices,
    })),
  ),
  "/precios": lazy(() =>
    import("../features/pricing/pricing").then((module) => ({
      default: module.Pricing,
    })),
  ),
  "/contacto": lazy(() =>
    import("../features/contact/contact").then((module) => ({
      default: module.Contact,
    })),
  ),
  "/crear-cuenta": lazy(() =>
    import("../features/register-with-plan/register-with-plan").then(
      (module) => ({ default: module.RegisterWithPlan }),
    ),
  ),
  "/perfil": lazy(() =>
    import("../features/user-profile/user-profile").then((module) => ({
      default: module.UserProfile,
    })),
  ),
  "/verificar-cuenta": lazy(() =>
    import("../features/register-with-plan/registration-verification").then(
      (module) => ({ default: module.RegistrationVerification }),
    ),
  ),
  "/politica-de-privacidad": lazy(() =>
    import("../features/register-with-plan/privacy-policy").then((module) => ({
      default: module.PrivacyPolicy,
    })),
  ),
  "/terminos-y-condiciones": lazy(() =>
    import("../features/register-with-plan/terms-and-conditions").then(
      (module) => ({ default: module.TermsAndConditions }),
    ),
  ),
};

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
        <p className="route-loading" role="status" aria-live="polite">
          Preparando esta sección…
        </p>
      }
    >
      <Content />
    </Suspense>
  );
}

export function SectionPage({ path }: { path: string }) {
  const page = PAGE_META[path];
  if (!page) return <ErrorPages status="404" />;
  return (
    <SectionPageFrame page={page}>
      <SectionContent path={path} />
    </SectionPageFrame>
  );
}
