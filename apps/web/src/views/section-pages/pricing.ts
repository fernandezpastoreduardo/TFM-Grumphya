import type { SectionPageDefinition } from "./section-page-definition";

const loadPricingPage = () =>
  import("../../features/pricing/pricing").then((module) => ({
    default: module.Pricing,
  }));

export const PRICING_PAGES: Record<string, SectionPageDefinition> = {
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
};
