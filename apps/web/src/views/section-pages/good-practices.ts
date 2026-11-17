import type { SectionPageDefinition } from "./section-page-definition";

export const GOOD_PRACTICES_PAGES: Record<string, SectionPageDefinition> = {
  "/buenas-practicas": {
    meta: {
      title: "Primero el problema. Luego el código.",
      intro:
        "Validar una necesidad antes de construir ayuda a cuidar el tiempo, el presupuesto y la energía del equipo.",
      theme: "calm",
      mascot: "good-practices",
    },
    load: () =>
      import("../../features/good-practices/good-practices").then((module) => ({
        default: module.GoodPractices,
      })),
  },
};
