import { afterEach, describe, expect, it } from "vitest";
import { DevelopmentVerificationDelivery } from "./verification-delivery";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("development verification delivery", () => {
  it("keeps a test verification token without exposing the submitted address", async () => {
    process.env.NODE_ENV = "development";
    const delivery = new DevelopmentVerificationDelivery();
    await delivery.deliver("attacker-controlled@example.com", "opaque-test-token");
    expect(delivery.getLatest()).toEqual({ token: "opaque-test-token" });
    expect(JSON.stringify(delivery.getLatest())).not.toContain("attacker-controlled@example.com");
  });

  it("fails closed in production", async () => {
    process.env.NODE_ENV = "production";
    const delivery = new DevelopmentVerificationDelivery();
    await expect(delivery.deliver("person@example.com", "opaque-test-token")).rejects.toThrow();
    expect(delivery.getLatest()).toBeUndefined();
  });
});
