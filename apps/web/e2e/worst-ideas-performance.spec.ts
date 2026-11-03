import { expect, test } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const OPTIMIZED_MASCOT_ASSET = "/assets/grumphya/worst-ideas-wall.webp";
const MAX_RANKING_ITEMS = 10;

test("uses the optimized illustration for the Worst Ideas mascot", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto("/lo-peor-de-lo-peor");

  const mobileMascot = page.locator(
    ".section-mobile-mascot.mascot-worst-ideas",
  );
  await expect(mobileMascot).toBeVisible();
  const mobileMascotImage = mobileMascot.locator("img");
  await expect(mobileMascotImage).toBeVisible();
  await expect(mobileMascotImage).toHaveAttribute(
    "src",
    OPTIMIZED_MASCOT_ASSET,
  );
  await expect(mobileMascotImage).toHaveAttribute("loading", "lazy");
});

test("keeps the weekly ranking card height when its maximum results load", async ({
  page,
}) => {
  let releaseRankingResponse = () => {};
  const rankingResponsePending = new Promise<void>((resolve) => {
    releaseRankingResponse = resolve;
  });
  await page.route("**/api/worst-ideas", async (route) => {
    await rankingResponsePending;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        Array.from({ length: MAX_RANKING_ITEMS }, (_, index) => ({
          safeTitle: `Idea ${index + 1}`,
          weeklyCount: MAX_RANKING_ITEMS - index,
        })),
      ),
    });
  });

  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto("/lo-peor-de-lo-peor");
  const rankingCard = page.locator(
    ".worst-ideas-rankings > .ranking-card[aria-labelledby='weekly-title']",
  );
  await expect(rankingCard.locator(".idea-ranking-skeleton-row")).toHaveCount(
    MAX_RANKING_ITEMS,
  );
  const skeletonHeight = await rankingCard.evaluate(
    (node) => node.getBoundingClientRect().height,
  );

  releaseRankingResponse();
  await expect(rankingCard.locator(".idea-ranking li")).toHaveCount(
    MAX_RANKING_ITEMS,
  );
  const loadedHeight = await rankingCard.evaluate(
    (node) => node.getBoundingClientRect().height,
  );

  expect(Math.abs(loadedHeight - skeletonHeight)).toBeLessThan(2);
});

test("keeps the anonymous account prompt readable in both themes", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto("/lo-peor-de-lo-peor");

  const accountPrompt = page.getByRole("link", {
    name: /ver planes para crear una cuenta/i,
  });
  await expect(accountPrompt).toBeVisible();

  const contrastRatio = async () =>
    accountPrompt.evaluate((element) => {
      const parseRgb = (color: string) =>
        color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      const luminance = (color: string) => {
        const channels = parseRgb(color).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return (
          0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
        );
      };
      const style = getComputedStyle(element);
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return (
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05)
      );
    });

  expect(await contrastRatio()).toBeGreaterThanOrEqual(4.5);
  await page.getByRole("switch", { name: /activar modo oscuro/i }).click();
  expect(await contrastRatio()).toBeGreaterThanOrEqual(4.5);
});
