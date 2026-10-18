import { expect, test } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1200, height: 1000 };
const HERO_ASSETS = [
  {
    path: "/humanos-notables",
    mascotClass: "mascot-notable-humans",
    asset: "/assets/grumphya/notable-humans-medal.png",
  },
  {
    path: "/buenas-practicas",
    mascotClass: "mascot-good-practices",
    asset: "/assets/grumphya/good-practices-thumbs-up-slippers.png",
  },
  {
    path: "/contacto",
    mascotClass: "mascot-contact",
    asset: "/assets/grumphya/contact-envelope.png",
  },
] as const;

test("keeps the Home hero and workspace spacing at desktop width", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /antes de construirla/i }),
  ).toBeVisible();

  const desktopSpacing = await page.evaluate(() => {
    const heading = document.querySelector(".home-heading");
    const workspace = document.querySelector(".home-workspace");
    const copy = document.querySelector(".home-heading-copy");
    const result = document.querySelector(".home-result");
    const marketing = document.querySelector(".home-marketing");
    const footer = document.querySelector(".home-footer");
    if (!heading || !workspace || !copy || !result || !marketing || !footer)
      return null;
    return {
      headingMarginBottom: getComputedStyle(heading).marginBottom,
      workspaceMarginTop: getComputedStyle(workspace).marginTop,
      copyPaddingTop: getComputedStyle(copy).paddingTop,
      copyGap: getComputedStyle(copy).gap,
      resultMarginTop: getComputedStyle(result).marginTop,
      marketingMarginTop: getComputedStyle(marketing).marginTop,
      footerMarginTop: getComputedStyle(footer).marginTop,
    };
  });

  expect(desktopSpacing).toEqual({
    headingMarginBottom: "0px",
    workspaceMarginTop: "40px",
    copyPaddingTop: "20px",
    copyGap: "20px",
    resultMarginTop: "40px",
    marketingMarginTop: "40px",
    footerMarginTop: "40px",
  });
});

test("places the roast ranking beside the chat on desktop and below it on mobile", async ({
  page,
}) => {
  const chat = page.locator(".roast-demo");
  const ranking = page.locator(".roast-ranking-card");

  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto("/descargate");
  await expect(ranking).toBeVisible();
  await expect(chat).toBeVisible();

  const desktopChatBox = await chat.boundingBox();
  const desktopRankingBox = await ranking.boundingBox();
  expect(desktopChatBox).not.toBeNull();
  expect(desktopRankingBox).not.toBeNull();
  expect(desktopRankingBox!.x).toBeGreaterThan(desktopChatBox!.x);
  expect(
    Math.abs(desktopRankingBox!.y - desktopChatBox!.y),
  ).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileChatBox = await chat.boundingBox();
  const mobileRankingBox = await ranking.boundingBox();
  expect(mobileChatBox).not.toBeNull();
  expect(mobileRankingBox).not.toBeNull();
  expect(mobileRankingBox!.y).toBeGreaterThanOrEqual(
    mobileChatBox!.y + mobileChatBox!.height,
  );
  expect(Math.abs(mobileRankingBox!.x - mobileChatBox!.x)).toBeLessThanOrEqual(
    1,
  );
});

test("uses the section hero assets with transparent pixels", async ({
  page,
}) => {
  for (const hero of HERO_ASSETS) {
    await page.goto(hero.path);
    const mascot = page.locator(`.section-hero-mascot.${hero.mascotClass}`);
    await expect(mascot).toBeVisible();

    const assetIsTransparent = await page.evaluate(async (assetPath) => {
      const image = new Image();
      image.src = assetPath;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return false;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      for (let alphaIndex = 3; alphaIndex < pixels.length; alphaIndex += 4) {
        if (pixels[alphaIndex] < 255) return true;
      }
      return false;
    }, hero.asset);

    expect(
      assetIsTransparent,
      `${hero.asset} should have transparent pixels`,
    ).toBe(true);
  }
});
