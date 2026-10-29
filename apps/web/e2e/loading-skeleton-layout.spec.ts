import { expect, test } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1600, height: 1000 };
const OVERFLOW_VIEWPORT = { width: 980, height: 1000 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const APP_FRAME_MAX_WIDTH = 1216;
const APP_FRAME_SIDE_GUTTER = 32;
const SLOW_IMPORT_MS = 2000;

test("app loading skeleton follows the app frame width on desktop and mobile", async ({
  page,
}) => {
  await page.route("**/src/views/section-page.tsx*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_IMPORT_MS));
    await route.continue();
  });

  for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
    await page.setViewportSize(viewport);
    await page.goto("/precios");

    const skeleton = page.locator(
      ".app-loading-skeleton .loading-skeleton-content",
    );
    await expect(skeleton).toBeVisible();
    const skeletonWidth = await skeleton.evaluate((element) =>
      Math.round(element.getBoundingClientRect().width),
    );
    const expectedFrameWidth = Math.min(
      viewport.width - APP_FRAME_SIDE_GUTTER,
      APP_FRAME_MAX_WIDTH,
    );
    expect(skeletonWidth).toBe(expectedFrameWidth);
  }
});

test("section content skeleton keeps the adaptive nav and responsive panel layout", async ({
  page,
}) => {
  await page.route("**/src/features/pricing/pricing.tsx*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_IMPORT_MS));
    await route.continue();
  });

  for (const viewport of [OVERFLOW_VIEWPORT, MOBILE_VIEWPORT]) {
    await page.setViewportSize(viewport);
    await page.goto("/precios");

    const skeleton = page.locator(".section-content-skeleton");
    await expect(skeleton).toBeVisible();
    const header = page.locator(".site-header");
    await expect(header.locator(".mobile-menu-trigger")).toBeVisible();
    if (viewport.width >= 980) {
      await expect(header).toHaveClass(/navigation-overflow/);
    }

    const panelColumns = await skeleton
      .locator(".skeleton-section-panels")
      .evaluate(
        (element) =>
          window.getComputedStyle(element).gridTemplateColumns.split(" ")
            .length,
      );
    expect(panelColumns).toBe(viewport.width <= 700 ? 1 : 2);
  }
});
