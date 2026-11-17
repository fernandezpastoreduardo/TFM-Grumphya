export const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeZone: "Europe/Madrid",
});

export function formatDate(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_FORMATTER.format(date) : null;
}
