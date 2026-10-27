import { expect, test } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const RANKING_HEADINGS = [
  {
    path: "/lo-peor-de-lo-peor",
    heading: ".ranking-card > .content-card-heading",
  },
  {
    path: "/humanos-notables",
    heading: ".humans-card > .content-card-heading",
  },
  {
    path: "/descargate",
    heading: ".roast-ranking-heading",
  },
] as const;

test("keeps mobile ranking titles clearly separated from their content", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);

  for (const ranking of RANKING_HEADINGS) {
    await page.goto(ranking.path);
    const headings = page.locator(ranking.heading);
    await expect(headings.first()).toBeVisible();

    const marginsBottom = await headings.evaluateAll((elements) =>
      elements.map((element) =>
        Number.parseFloat(getComputedStyle(element).marginBottom),
      ),
    );
    expect(marginsBottom.length).toBeGreaterThan(0);
    for (const marginBottom of marginsBottom) {
      expect(marginBottom).toBeGreaterThanOrEqual(22);
    }
  }
});
