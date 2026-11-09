import { expect, test } from "@playwright/test";

const LEGACY_PATHS = [
  "/desarrollo-seguro",
  "/desarrollo-seguro/",
  "/desarrollo-seguro/no-existe",
];

test("redirects HEAD requests for legacy paths without following the external site", async ({
  request,
}) => {
  const response = await request.head(LEGACY_PATHS[0], { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("https://desarrolloseguro.org/");
});

test("rejects POST bodies on every legacy path without redirecting them externally", async ({
  request,
}) => {
  for (const path of LEGACY_PATHS) {
    const response = await request.post(path, {
      data: "synthetic-post-body",
      maxRedirects: 0,
    });
    expect(response.status()).toBe(405);
    expect(response.headers().allow).toBe("GET, HEAD");
    expect(response.headers().location).toBeUndefined();
  }
});

test("does not redirect unrelated paths with a similar prefix", async ({
  request,
}) => {
  const response = await request.get("/desarrollo-seguro-otro", {
    maxRedirects: 0,
  });
  expect(response.status()).not.toBe(308);
  expect(response.headers().location).toBeUndefined();
});
