const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

export function formatAccreditationDate(value: string | null): string {
  if (value === null) return "No definida";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No definida";
  return DATE_FORMATTER.format(date);
}
