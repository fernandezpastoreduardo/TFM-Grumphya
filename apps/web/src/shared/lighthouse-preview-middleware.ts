import type { Connect } from "vite";
import { LIGHTHOUSE_WORST_IDEAS_RESPONSES } from "../features/worst-ideas/lighthouse-fixtures";
import {
  LIGHTHOUSE_ACCREDITATION_RESPONSE,
  LIGHTHOUSE_ANONYMOUS_USAGE_RESPONSE,
} from "./lighthouse-preview-fixtures";

function getFixture(
  method: string | undefined,
  pathname: string,
): object | undefined {
  if (method !== "GET") return undefined;
  if (
    pathname === `/api/accreditations/${LIGHTHOUSE_ACCREDITATION_RESPONSE.id}`
  ) {
    return LIGHTHOUSE_ACCREDITATION_RESPONSE;
  }
  return LIGHTHOUSE_WORST_IDEAS_RESPONSES.get(pathname);
}

export function createLighthousePreviewMiddleware(
  enabled: boolean,
): Connect.NextHandleFunction | undefined {
  if (!enabled) return undefined;

  return (request, response, next) => {
    const pathname = new URL(request.url ?? "/", "http://vite.local").pathname;
    if (!pathname.startsWith("/api/")) return next();
    response.setHeader("Cache-Control", "no-store");
    if (
      request.method === "POST" &&
      (pathname === "/api/anonymous-analytics" ||
        pathname === "/api/auth/refresh")
    ) {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (request.method === "POST" && pathname === "/api/anonymous-usage") {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(LIGHTHOUSE_ANONYMOUS_USAGE_RESPONSE));
      return;
    }
    const fixture = getFixture(request.method, pathname);
    if (!fixture) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(fixture));
  };
}
