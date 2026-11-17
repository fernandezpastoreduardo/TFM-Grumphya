import type { SectionPageDefinition } from "./section-page-definition";

export const PROFILE_PAGES: Record<string, SectionPageDefinition> = {
  "/perfil": {
    meta: {
      title: "Tu cuenta. Tus planes. Tus intentos.",
      intro: "Aquí tienes tus planes, tu actividad y los datos de tu cuenta.",
      theme: "mint",
      mascot: "profile",
    },
    load: () =>
      import("../../features/user-profile/user-profile").then((module) => ({
        default: module.UserProfile,
      })),
  },
};
