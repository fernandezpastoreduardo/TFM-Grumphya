export type SiteNavigationVariant = "home" | "section";

export const SITE_SECTION_LINKS = [
  { path: "/lo-peor-de-lo-peor", label: "Peores ideas" },
  { path: "/descargate", label: "Descárgate" },
  { path: "/humanos-notables", label: "Humanos notables" },
  { path: "/buenas-practicas", label: "Buenas prácticas" },
  { path: "/precios", label: "Planes" },
  { path: "/contacto", label: "Contacto" },
] as const;

const ADMIN_SECTION_LINK = {
  path: "/panel-control",
  label: "Panel de control",
} as const;

export function getSiteSectionLinks(isAdmin: boolean) {
  return isAdmin
    ? [...SITE_SECTION_LINKS, ADMIN_SECTION_LINK]
    : SITE_SECTION_LINKS;
}

export function isCurrentSiteSectionPath(
  itemPath: string,
  currentPath: string,
): boolean {
  return (
    itemPath === currentPath ||
    (itemPath === "/precios" && currentPath === "/crear-cuenta/planes")
  );
}
