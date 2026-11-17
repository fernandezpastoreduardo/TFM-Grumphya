export const ADMIN_TABS = [
  { id: "summary", label: "Resumen" },
  { id: "benchmark", label: "Benchmark de IA" },
  { id: "telemetry", label: "Telemetría de IA" },
  { id: "security", label: "Seguridad y acceso" },
  { id: "anonymous", label: "Analítica anónima" },
  { id: "web-quality", label: "Calidad web" },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]["id"];

export function getNextTabIndex(
  currentIndex: number,
  key: string,
): number | null {
  if (key === "ArrowRight") return (currentIndex + 1) % ADMIN_TABS.length;
  if (key === "ArrowLeft")
    return (currentIndex - 1 + ADMIN_TABS.length) % ADMIN_TABS.length;
  if (key === "Home") return 0;
  if (key === "End") return ADMIN_TABS.length - 1;
  return null;
}
