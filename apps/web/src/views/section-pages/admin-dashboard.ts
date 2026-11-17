import type { SectionPageDefinition } from "./section-page-definition";

export const ADMIN_DASHBOARD_PAGES: Record<string, SectionPageDefinition> = {
  "/panel-control": {
    meta: {
      title: "Panel de control",
      intro:
        "Ingresos simulados, costes estimados y señales operativas. Sin hacer como que esto ya es una multinacional.",
      theme: "calm",
      mascot: "admin",
    },
    load: () =>
      import("../../features/admin-dashboard/admin-dashboard").then(
        (module) => ({ default: module.AdminDashboard }),
      ),
  },
};
