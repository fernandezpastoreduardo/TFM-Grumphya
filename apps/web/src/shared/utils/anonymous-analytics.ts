type PublicAnalyticsPage =
  | "home"
  | "precios"
  | "buenas-practicas"
  | "humanos-notables"
  | "lo-peor-de-lo-peor"
  | "contacto"
  | "descargate";

type PlanCode = "ILUMINADO" | "FALTON";

const PUBLIC_PAGE_CODES: Readonly<Record<string, PublicAnalyticsPage>> = {
  "/": "home",
  "/precios": "precios",
  "/crear-cuenta/planes": "precios",
  "/buenas-practicas": "buenas-practicas",
  "/humanos-notables": "humanos-notables",
  "/lo-peor-de-lo-peor": "lo-peor-de-lo-peor",
  "/contacto": "contacto",
  "/descargate": "descargate",
};
const MOBILE_VIEWPORT_MAX_WIDTH = 699;
const ANALYTICS_ENDPOINT = "/api/anonymous-analytics";

export function recordAnonymousPageView(path: string): void {
  const page = PUBLIC_PAGE_CODES[path];
  if (!page) return;
  void sendAnonymousEvent({ event: "page_view", page, plan: null });
}

export function recordAnonymousPlanSelection(plan: PlanCode): void {
  sendAnonymousEvent({ event: "plan_selection", page: "precios", plan });
}

function sendAnonymousEvent(event: {
  event: "page_view" | "plan_selection";
  page: PublicAnalyticsPage;
  plan: PlanCode | null;
}): Promise<void> {
  const device =
    typeof window.matchMedia === "function" &&
    window.matchMedia(`(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH}px)`).matches
      ? "mobile"
      : "desktop";
  return Promise.resolve()
    .then(() =>
      fetch(ANALYTICS_ENDPOINT, {
        method: "POST",
        mode: "same-origin",
        credentials: "omit",
        cache: "no-store",
        keepalive: true,
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...event, device }),
      }),
    )
    .then(() => undefined)
    .catch(() => undefined);
}
