import type { SectionPageDefinition } from "./section-page-definition";

export const NOTABLE_HUMANS_PAGES: Record<string, SectionPageDefinition> = {
  "/humanos-notables": {
    meta: {
      title: "Humanos notables",
      intro:
        "Un aplauso para quien ha traído una idea con algo más que optimismo y una presentación bonita.",
      theme: "mint",
      mascot: "notable-humans",
    },
    load: () =>
      import("../../features/notable-humans/notable-humans").then((module) => ({
        default: module.NotableHumans,
      })),
  },
};
