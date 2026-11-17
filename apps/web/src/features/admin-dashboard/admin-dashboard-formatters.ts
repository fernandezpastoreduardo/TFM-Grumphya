import type {
  AdminLighthouseRun,
  AnalyticsPage,
} from "./admin-dashboard.models";

export const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});
export const EUR_COST = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 4,
});
export const EUR_PER_ATTEMPT = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 4,
  maximumFractionDigits: 8,
});
export const EUR_WHOLE = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
export const DECIMAL_FOUR = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 4,
});
export const DATE = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});
export const WEEK_LABEL = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
export const MONTH_LABEL = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  timeZone: "UTC",
});
export const MONTH_YEAR_LABEL = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export const REFERENCE_DATE_LABEL = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export const BCE_EXCHANGE_RATES_URL =
  "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";

export const ANALYTICS_PAGE_LABELS: Readonly<Record<AnalyticsPage, string>> = {
  home: "Inicio",
  precios: "Planes",
  "buenas-practicas": "Buenas prácticas",
  "humanos-notables": "Humanos notables",
  "lo-peor-de-lo-peor": "El muro de la vergüenza",
  contacto: "Contacto",
  descargate: "Descárgate",
  other_public_pages: "Otras secciones",
};
export const ANALYTICS_PLAN_LABELS = {
  ILUMINADO: "Iluminado",
  FALTON: "Faltón",
} as const;
export const ANALYTICS_MONTH = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

export const LIGHTHOUSE_PAGE_LABELS: Readonly<
  Record<AdminLighthouseRun["page"], string>
> = {
  home: "Inicio",
  precios: "Planes",
  "lo-peor-de-lo-peor": "El muro de la vergüenza",
};
export const LIGHTHOUSE_SCORE = new Intl.NumberFormat("es-ES", {
  style: "percent",
  maximumFractionDigits: 0,
});
export const LIGHTHOUSE_NUMBER = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 2,
});

export const CHART = {
  width: 720,
  height: 230,
  top: 14,
  bottom: 42,
  left: 36,
  right: 12,
};
export const CHART_COLORS = {
  registeredUsers: "#087f8c",
  admins: "#e89b22",
  anonymous: "#d94d7b",
} as const;
