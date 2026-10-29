import { expect, test } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1600, height: 1000 };
const OVERFLOW_VIEWPORT = { width: 980, height: 1000 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const APP_FRAME_MAX_WIDTH = 1240;
const APP_FRAME_SIDE_GUTTER = 32;

test("prerendered pricing page follows the app frame width on desktop and mobile", async ({
  page,
}) => {
  for (const viewport of [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]) {
    await page.setViewportSize(viewport);
    await page.goto("/precios");

    const appFrame = page.locator(".app-frame");
    await expect(appFrame).toBeVisible();
    const expectedFrameWidth = Math.min(
      viewport.width - APP_FRAME_SIDE_GUTTER,
      APP_FRAME_MAX_WIDTH,
    );
    await expect
      .poll(() =>
        appFrame.evaluate((element) =>
          Math.round(element.getBoundingClientRect().width),
        ),
      )
      .toBe(expectedFrameWidth);
  }
});

test("prerendered pricing panels and navigation adapt to the viewport", async ({
  page,
}) => {
  for (const viewport of [OVERFLOW_VIEWPORT, MOBILE_VIEWPORT]) {
    await page.setViewportSize(viewport);
    await page.goto("/precios");

    const header = page.locator(".site-header");
    await expect(header.locator(".mobile-menu-trigger")).toBeVisible();
    if (viewport.width >= 980) {
      await expect(header).toHaveClass(/navigation-overflow/);
    }

    const pricingGrid = page.locator(".pricing-grid");
    await expect
      .poll(() =>
        pricingGrid.evaluate(
          (element) =>
            window.getComputedStyle(element).gridTemplateColumns.split(" ")
              .length,
        ),
      )
      .toBe(viewport.width <= 700 ? 1 : 3);
  }
});
