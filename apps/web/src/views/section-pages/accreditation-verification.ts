import { ACCREDITATION_VERIFICATION_URL } from "../../shared/accreditation-verification";
import type { SectionPageDefinition } from "./section-page-definition";

export const ACCREDITATION_VERIFICATION_PAGE: Record<
  string,
  SectionPageDefinition
> = {
  [ACCREDITATION_VERIFICATION_URL]: {
    meta: {
      title: "Ficha pública de revisión interna",
      intro:
        "Consulta la ficha de Grumphya y comprueba qué dominio figura para esta demostración académica.",
      theme: "calm",
    },
    load: () =>
      import("../../features/accreditation-verification/accreditation-verification").then(
        (module) => ({ default: module.AccreditationVerification }),
      ),
  },
};
