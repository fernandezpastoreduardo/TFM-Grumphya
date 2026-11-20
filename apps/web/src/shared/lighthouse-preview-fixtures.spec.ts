import { describe, expect, it } from "vitest";
import {
  LIGHTHOUSE_ACCREDITATION_RESPONSE,
  LIGHTHOUSE_ANONYMOUS_USAGE_RESPONSE,
} from "./lighthouse-preview-fixtures";
import { createLighthousePreviewMiddleware } from "./lighthouse-preview-middleware";

type PreviewRequest = { method: string; url: string };
type PreviewResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};
type PreviewHandler = (
  request: PreviewRequest,
  response: PreviewResponse,
  next: () => void,
) => void;

function requestFixture(handler: PreviewHandler, method: string, url: string) {
  const headers = new Map<string, string>();
  let body: string | undefined;
  let nextCalled = false;
  const response: PreviewResponse = {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(name, value);
    },
    end(value) {
      body = value;
    },
  };
  handler({ method, url }, response, () => {
    nextCalled = true;
  });
  return { status: response.statusCode, body, headers, nextCalled };
}

describe("Lighthouse preview fixtures", () => {
  it("does not install the fixture middleware outside the isolated preview", () => {
    expect(createLighthousePreviewMiddleware(false)).toBeUndefined();
  });

  it("serves only the public GET fixtures", () => {
    const handler = createLighthousePreviewMiddleware(true) as PreviewHandler;
    expect(handler).toBeDefined();
    if (!handler) return;

    const ranking = requestFixture(handler, "GET", "/api/worst-ideas");
    expect(ranking.status).toBe(200);
    expect(JSON.parse(ranking.body ?? "")).toHaveLength(2);
    expect(ranking.headers.get("Cache-Control")).toBe("no-store");

    const accreditation = requestFixture(
      handler,
      "GET",
      `/api/accreditations/${LIGHTHOUSE_ACCREDITATION_RESPONSE.id}`,
    );
    expect(accreditation.status).toBe(200);
    expect(JSON.parse(accreditation.body ?? "").id).toBe(
      LIGHTHOUSE_ACCREDITATION_RESPONSE.id,
    );
  });

  it("keeps unlisted API routes unavailable and passes non-API paths onward", () => {
    const handler = createLighthousePreviewMiddleware(true) as PreviewHandler;
    expect(handler).toBeDefined();
    if (!handler) return;

    expect(
      requestFixture(handler, "GET", "/api/admin/web-quality").status,
    ).toBe(404);
    expect(requestFixture(handler, "POST", "/api/worst-ideas").status).toBe(
      404,
    );
    expect(requestFixture(handler, "POST", "/api/auth/refresh").status).toBe(
      204,
    );
    expect(requestFixture(handler, "GET", "/precios").nextCalled).toBe(true);
  });

  it("serves the badge stub locally for Lighthouse collection", () => {
    const handler = createLighthousePreviewMiddleware(true) as PreviewHandler;
    expect(handler).toBeDefined();
    if (!handler) return;

    const badge = requestFixture(
      handler,
      "GET",
      "/__lighthouse/badge-widget.js",
    );
    expect(badge.status).toBe(200);
    expect(badge.body).toBe("void 0;");
    expect(badge.headers.get("Content-Type")).toBe(
      "application/javascript; charset=utf-8",
    );
  });

  it("serves a valid synthetic anonymous quota for the home page", () => {
    const handler = createLighthousePreviewMiddleware(true) as PreviewHandler;
    expect(handler).toBeDefined();
    if (!handler) return;

    const usage = requestFixture(handler, "POST", "/api/anonymous-usage");
    expect(usage.status).toBe(200);
    expect(JSON.parse(usage.body ?? "")).toEqual(
      LIGHTHOUSE_ANONYMOUS_USAGE_RESPONSE,
    );
    expect(usage.headers.get("Cache-Control")).toBe("no-store");
  });
});
