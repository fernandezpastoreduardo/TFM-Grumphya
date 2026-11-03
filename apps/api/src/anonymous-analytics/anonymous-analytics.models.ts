export const ANONYMOUS_ANALYTICS_EVENTS = [
  "page_view",
  "plan_selection",
] as const;

export const ANONYMOUS_ANALYTICS_PAGES = [
  "home",
  "precios",
  "buenas-practicas",
  "humanos-notables",
  "lo-peor-de-lo-peor",
  "contacto",
  "descargate",
] as const;

export type AnonymousAnalyticsEvent =
  (typeof ANONYMOUS_ANALYTICS_EVENTS)[number];
export type AnonymousAnalyticsPage = (typeof ANONYMOUS_ANALYTICS_PAGES)[number];
export type AnonymousAnalyticsDevice = "mobile" | "desktop";
export type AnonymousAnalyticsPlan = "ILUMINADO" | "FALTON";

export type AnonymousAnalyticsInput = {
  event: AnonymousAnalyticsEvent;
  page: AnonymousAnalyticsPage;
  device: AnonymousAnalyticsDevice;
  plan: AnonymousAnalyticsPlan | null;
};

export type AnonymousAnalyticsSnapshot = {
  viewsByPage: Array<{
    page: AnonymousAnalyticsPage | "other_public_pages";
    count: number;
  }>;
  deviceShares: Array<{
    device: AnonymousAnalyticsDevice;
    percentage: number;
  }>;
  monthlyPlanSelections: Array<{
    month: string;
    plan: AnonymousAnalyticsPlan;
    count: number;
  }>;
  monthlyPlanActivations: Array<{
    month: string;
    plan: AnonymousAnalyticsPlan;
    count: number;
  }>;
};

export function parseAnonymousAnalyticsInput(
  input: unknown,
): AnonymousAnalyticsInput | null {
  if (!isRecord(input)) return null;
  const expectedKeys = ["event", "page", "device", "plan"];
  if (
    Object.keys(input).length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(input, key))
  )
    return null;
  const event = parseEvent(input.event);
  const page = parsePage(input.page);
  const device = parseDevice(input.device);
  const plan = parseOptionalPlan(input.plan);
  if (!event || !page || !device || plan === undefined) return null;
  if (event === "page_view" && plan !== null) return null;
  if (event === "plan_selection" && (page !== "precios" || plan === null))
    return null;
  return { event, page, device, plan };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEvent(value: unknown): AnonymousAnalyticsEvent | null {
  return value === "page_view" || value === "plan_selection" ? value : null;
}

function parsePage(value: unknown): AnonymousAnalyticsPage | null {
  return typeof value === "string" &&
    (ANONYMOUS_ANALYTICS_PAGES as readonly string[]).includes(value)
    ? (value as AnonymousAnalyticsPage)
    : null;
}

function parseDevice(value: unknown): AnonymousAnalyticsDevice | null {
  return value === "mobile" || value === "desktop" ? value : null;
}

function parseOptionalPlan(
  value: unknown,
): AnonymousAnalyticsPlan | null | undefined {
  if (value === null) return null;
  if (value === "ILUMINADO" || value === "FALTON") return value;
  return undefined;
}
