import { describe, expect, it } from "vitest";
import { createDevelopmentSecurityApiProxy } from "./development-security-api-proxy.js";

const GRUMPHYA_API_TARGET = "http://127.0.0.1:3000";
const DEVELOPMENT_SECURITY_API_TARGET = "http://127.0.0.1:3001";
const LOCALHOST_API_TARGET = "http://localhost:3001";
const IPV6_LOOPBACK_API_TARGET = "http://[::1]:3001";
const NON_LOCAL_API_TARGET = "https://attacker.example";
const REMOTE_HTTP_API_TARGET = "http://attacker.example:3001";
const USERINFO_API_TARGET = "http://user:pass@127.0.0.1:3001";
const MALFORMED_API_TARGET = "not a url";
const PATH_PREFIXED_API_TARGET = "http://127.0.0.1:3001/api";

describe("createDevelopmentSecurityApiProxy", () => {
  it("routes Desarrollo Seguro requests to its own API before the Grumphya fallback", () => {
    const proxy = createDevelopmentSecurityApiProxy(
      GRUMPHYA_API_TARGET,
      DEVELOPMENT_SECURITY_API_TARGET,
    );

    expect(Object.keys(proxy)).toEqual(["/api/desarrollo-seguro", "/api"]);
    expect(proxy["/api/desarrollo-seguro"]).toEqual({
      target: DEVELOPMENT_SECURITY_API_TARGET,
      changeOrigin: false,
    });
    expect(proxy["/api"]).toEqual({ target: GRUMPHYA_API_TARGET });
  });

  it("rejects a non-local Desarrollo Seguro target", () => {
    expect(() =>
      createDevelopmentSecurityApiProxy(
        GRUMPHYA_API_TARGET,
        NON_LOCAL_API_TARGET,
      ),
    ).toThrow("development_security_api_proxy_target_must_be_local");
  });

  it.each([REMOTE_HTTP_API_TARGET, USERINFO_API_TARGET, MALFORMED_API_TARGET])(
    "rejects unsafe DS proxy target %s",
    (target) => {
      expect(() =>
        createDevelopmentSecurityApiProxy(GRUMPHYA_API_TARGET, target),
      ).toThrow("development_security_api_proxy_target_must_be_local");
    },
  );

  it("accepts localhost and IPv6 loopback origin targets", () => {
    expect(() =>
      createDevelopmentSecurityApiProxy(
        GRUMPHYA_API_TARGET,
        LOCALHOST_API_TARGET,
      ),
    ).not.toThrow();
    expect(() =>
      createDevelopmentSecurityApiProxy(
        GRUMPHYA_API_TARGET,
        IPV6_LOOPBACK_API_TARGET,
      ),
    ).not.toThrow();
  });

  it("rejects DS proxy targets that rewrite the path", () => {
    expect(() =>
      createDevelopmentSecurityApiProxy(
        GRUMPHYA_API_TARGET,
        PATH_PREFIXED_API_TARGET,
      ),
    ).toThrow("development_security_api_proxy_target_must_be_local");
  });
});
