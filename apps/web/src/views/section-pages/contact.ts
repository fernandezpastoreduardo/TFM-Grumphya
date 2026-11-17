import type { SectionPageDefinition } from "./section-page-definition";

export const CONTACT_PAGES: Record<string, SectionPageDefinition> = {
  "/contacto": {
    meta: {
      title: "¿Necesitas decirlo en voz alta?",
      intro:
        "El formulario existe. Mi interés por recibirlo está en fase de evaluación.",
      theme: "rose",
      mascot: "contact",
    },
    load: () =>
      import("../../features/contact/contact").then((module) => ({
        default: module.Contact,
      })),
  },
};
