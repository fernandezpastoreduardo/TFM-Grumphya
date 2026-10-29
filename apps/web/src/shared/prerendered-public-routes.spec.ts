import { describe, expect, it } from "vitest";
import routes from "./prerendered-public-routes.json";
import { isPrerenderedPublicPath } from "./prerendered-public-routes";

const NON_PRERENDERED_PATHS = [
  "/perfil",
  "/panel-control",
  "/login",
  "/ruta-inexistente",
  "/precios/",
] as const;

describe("isPrerenderedPublicPath", () => {
  it("recognizes every route declared for public prerendering", () => {
    for (const { path } of routes) {
      expect(isPrerenderedPublicPath(path)).toBe(true);
    }
  });

  it.each(NON_PRERENDERED_PATHS)(
    "does not mark %s for public prerendering",
    (path) => {
      expect(isPrerenderedPublicPath(path)).toBe(false);
    },
  );
});
