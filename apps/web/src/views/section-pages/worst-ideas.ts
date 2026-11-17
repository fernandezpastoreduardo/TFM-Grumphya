import type { SectionPageDefinition } from "./section-page-definition";

export const WORST_IDEAS_PAGES: Record<string, SectionPageDefinition> = {
  "/lo-peor-de-lo-peor": {
    meta: {
      title: "El muro de la vergüenza",
      intro:
        "Una pequeña clasificación de ocurrencias que se han ganado una pausa y una conversación seria.",
      theme: "rose",
      mascot: "worst-ideas",
    },
    load: () =>
      import("../../features/worst-ideas/worst-ideas").then((module) => ({
        default: module.WorstIdeas,
      })),
  },
};
