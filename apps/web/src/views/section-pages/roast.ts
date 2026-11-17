import type { SectionPageDefinition } from "./section-page-definition";

export const ROAST_PAGES: Record<string, SectionPageDefinition> = {
  "/descargate": {
    meta: {
      title: "Descárgate a gusto",
      intro:
        "Suelta el insulto. Yo pongo la cara de haber leído cosas peores. Probablemente.",
      theme: "blue",
      mascot: "roast",
    },
    load: () =>
      import("../../features/roast/roast").then((module) => ({
        default: module.Roast,
      })),
  },
};
