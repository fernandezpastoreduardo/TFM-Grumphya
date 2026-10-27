import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { readCookie } from "./read-cookie";

const COOKIE_NAME = "session_token";

function requestWithCookieHeader(header?: string): Request {
  return { headers: { cookie: header } } as Request;
}

describe("readCookie", () => {
  it("returns undefined when the request has no cookie header", () => {
    expect(readCookie(requestWithCookieHeader(), COOKIE_NAME)).toBeUndefined();
    expect(
      readCookie(requestWithCookieHeader(""), COOKIE_NAME),
    ).toBeUndefined();
  });

  it("matches a trimmed cookie name and decodes its value", () => {
    const request = requestWithCookieHeader(
      "other=first;  session_token=one%20two ",
    );

    expect(readCookie(request, COOKIE_NAME)).toBe("one two");
  });

  it("preserves equals signs within a cookie value", () => {
    const request = requestWithCookieHeader("session_token=part=two==");

    expect(readCookie(request, COOKIE_NAME)).toBe("part=two==");
  });

  it("requires an exact cookie name and returns undefined when absent", () => {
    const request = requestWithCookieHeader(
      "prefix_session_token=wrong; other=value",
    );

    expect(readCookie(request, COOKIE_NAME)).toBeUndefined();
  });

  it("returns undefined for a malformed percent-encoded value", () => {
    const request = requestWithCookieHeader("session_token=%E0%A4%A");

    expect(readCookie(request, COOKIE_NAME)).toBeUndefined();
  });
});
