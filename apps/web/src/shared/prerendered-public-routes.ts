import routes from "./prerendered-public-routes.json";

const PRERENDERED_PUBLIC_PATHS = new Set(routes.map(({ path }) => path));

export function isPrerenderedPublicPath(path: string): boolean {
  return PRERENDERED_PUBLIC_PATHS.has(path);
}
