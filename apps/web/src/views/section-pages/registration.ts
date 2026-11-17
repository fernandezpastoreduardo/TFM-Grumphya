import type { SectionPageDefinition } from "./section-page-definition";

export const REGISTRATION_PAGES: Record<string, SectionPageDefinition> = {
  "/crear-cuenta": {
    meta: {
      title: "Una cuenta. Un plan. Sin letra pequeña de película.",
      intro:
        "La contratación de esta versión es simulada. No introduzcas datos bancarios porque no hacen falta.",
      theme: "blue",
      mascot: "register",
    },
    load: () =>
      import("../../features/register-with-plan/register-with-plan").then(
        (module) => ({ default: module.RegisterWithPlan }),
      ),
  },
  "/verificar-cuenta": {
    meta: {
      title: "Una última comprobación",
      intro:
        "Validamos el enlace. Después decidirás si confirmas la contratación simulada.",
      theme: "mint",
    },
    load: () =>
      import("../../features/register-with-plan/registration-verification").then(
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
      import("../../features/register-with-plan/privacy-policy").then(
        (module) => ({ default: module.PrivacyPolicy }),
      ),
  },
  "/terminos-y-condiciones": {
    meta: {
      title: "Términos y condiciones",
      intro: "Cómo funciona Grumphya y qué ocurre con las ideas que compartes.",
      theme: "calm",
    },
    load: () =>
      import("../../features/register-with-plan/terms-and-conditions").then(
        (module) => ({ default: module.TermsAndConditions }),
      ),
  },
};
