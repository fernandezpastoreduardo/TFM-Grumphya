import type { SectionPageDefinition } from "./section-page-definition";

export const AUTHENTICATION_PAGES: Record<string, SectionPageDefinition> = {
  "/login": {
    meta: {
      title: "Ah, has vuelto.",
      intro:
        "Entra para consultar tu historial y el estado real de tu plan. La nostalgia es opcional.",
      theme: "mint",
      mascot: "login",
    },
    load: () =>
      import("../../features/authentication/authentication-page").then(
        (module) => ({ default: module.AuthenticationPage }),
      ),
  },
};
