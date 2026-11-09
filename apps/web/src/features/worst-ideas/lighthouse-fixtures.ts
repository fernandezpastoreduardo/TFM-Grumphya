// Stable, public-only ranking data for the isolated Lighthouse preview.
export const LIGHTHOUSE_WORST_IDEAS_RESPONSES = new Map<string, object>([
  [
    "/api/worst-ideas",
    [
      { safeTitle: "Una suscripción a los lunes", weeklyCount: 4 },
      { safeTitle: "Una app para ordenar calcetines", weeklyCount: 2 },
    ],
  ],
  [
    "/api/worst-ideas/all-time",
    [
      { safeTitle: "La red social de las tostadoras", count: 14 },
      { safeTitle: "Una suscripción a los lunes", count: 8 },
    ],
  ],
]);
