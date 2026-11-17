import type { ComponentType } from "react";
import type { SectionPageMeta } from "../../shared/components/section-page-frame";

export type SectionPageDefinition = {
  meta: SectionPageMeta;
  load: () => Promise<{ default: ComponentType }>;
};
