import { expect, test } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1200, height: 1000 };
const HERO_ASSETS = [
  {
    path: "/humanos-notables",
    mascotClass: "mascot-notable-humans",
    asset: "/assets/grumphya/notable-humans-hero.png",
  },
  {
    path: "/buenas-practicas",
    mascotClass: "mascot-good-practices",
    asset: "/assets/grumphya/good-practices-checklist.png",
  },
  {
    path: "/contacto",
    mascotClass: "mascot-contact",
    asset: "/assets/grumphya/contact-hero-phone.png",
  },
  {
    path: "/precios",
    mascotClass: "mascot-plans",
    asset: "/assets/grumphya/plans-coffee.png",
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

  const homeHero = await page
    .locator(".home-hero-stage .home-creature")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        backgroundSize: style.backgroundSize,
        backgroundPosition: style.backgroundPosition,
      };
    });
  expect(homeHero.backgroundImage).toContain(
    "/assets/grumphya/home-idea-review.png",
  );
  expect(homeHero.backgroundSize).toBe("contain");
  expect(homeHero.backgroundPosition).toBe("50% 100%");
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
    const backgroundImage = await mascot.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    expect(backgroundImage).toContain(hero.asset);

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

test("removes the hero scribble and mirrors the plans mascot", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto("/precios");

  await expect(
    page.getByRole("heading", { name: "Once usos. Sí, once." }),
  ).toBeVisible();
  await expect(page.getByText(/¿en serio\?/i)).toHaveCount(0);
  const planMascot = page.locator(".section-hero-mascot.mascot-plans");
  await expect(planMascot).toBeVisible();
  await expect
    .poll(() =>
      planMascot.evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("matrix(-1, 0, 0, 1, 0, 0)");
});

test("keeps the contact illustration card white and uses the updated art", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.addInitScript(() => {
    localStorage.setItem("grumphya-theme", "dark");
  });
  await page.goto("/contacto");

  const contactCard = page.locator(".contact-side");
  await expect(contactCard).toBeVisible();
  const contactStyle = await contactCard.evaluate((element) => {
    const style = getComputedStyle(element);
    const illustration = element.querySelector(".contact-creature");
    return {
      backgroundColor: style.backgroundColor,
      transitionProperty: style.transitionProperty,
      illustration: illustration
        ? getComputedStyle(illustration).backgroundImage
        : "",
    };
  });
  expect(contactStyle.backgroundColor).toBe("rgb(255, 255, 255)");
  expect(contactStyle.transitionProperty).toContain("translate");
  expect(contactStyle.illustration).toContain(
    "/assets/grumphya/contact-coffee-inbox.png",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await contactCard.hover();
  const reducedContactMotion = await contactCard.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transitionProperty: style.transitionProperty,
      hoverTranslate: style.translate,
    };
  });
  expect(reducedContactMotion).toEqual({
    transitionProperty: "none",
    hoverTranslate: "none",
  });
});

test("runs Home and section animations only when motion is allowed", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /antes de construirla/i }),
  ).toBeVisible();

  const homeAnimations = await page.evaluate(() => ({
    supportsScrollReveal: CSS.supports("animation-timeline", "view()"),
    scrollReveal: getComputedStyle(
      document.querySelector(".home-marketing") as Element,
    ).animationName,
    copy: getComputedStyle(
      document.querySelector(".home-heading-copy") as Element,
    ).animationName,
    mascot: getComputedStyle(
      document.querySelector(".home-hero-stage .home-creature") as Element,
    ).animationName,
    buttonTransition: getComputedStyle(
      document.querySelector(".home-page button") as Element,
    ).transitionProperty,
  }));
  expect(homeAnimations).toEqual({
    supportsScrollReveal: homeAnimations.supportsScrollReveal,
    scrollReveal: homeAnimations.supportsScrollReveal ? "scroll-rise" : "none",
    copy: "home-copy-enter",
    mascot: "mascot-float",
    buttonTransition: "transform, box-shadow",
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedHomeAnimations = await page.evaluate(() => ({
    scrollReveal: getComputedStyle(
      document.querySelector(".home-marketing") as Element,
    ).animationName,
    homeCopy: getComputedStyle(
      document.querySelector(".home-heading-copy") as Element,
    ).animationName,
    mascot: getComputedStyle(
      document.querySelector(".home-hero-stage .home-creature") as Element,
    ).animationName,
    buttonTransition: getComputedStyle(
      document.querySelector(".home-page button") as Element,
    ).transitionProperty,
  }));
  expect(reducedHomeAnimations).toEqual({
    scrollReveal: "none",
    homeCopy: "none",
    mascot: "none",
    buttonTransition: "none",
  });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/precios");
  await expect(
    page.getByRole("heading", { name: "Once usos. Sí, once." }),
  ).toBeVisible();
  const sectionAnimations = await page.evaluate(() => ({
    copy: getComputedStyle(
      document.querySelector(".section-hero-copy") as Element,
    ).animationName,
    mascot: getComputedStyle(
      document.querySelector(".section-hero-mascot") as Element,
    ).animationName,
  }));
  expect(sectionAnimations).toEqual({
    copy: "section-copy-enter",
    mascot: "section-mascot-float",
  });

  await page.goto("/contacto");
  await expect(page.locator(".contact-layout")).toBeVisible();
  const sectionScrollReveal = await page.evaluate(() => {
    const layout = document.querySelector(".section-main > .contact-layout");
    return {
      supported: CSS.supports("animation-timeline", "view()"),
      animationName: layout
        ? getComputedStyle(layout).animationName
        : "missing",
    };
  });
  expect(sectionScrollReveal.animationName).toBe(
    sectionScrollReveal.supported ? "section-scroll-rise" : "none",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedSectionStyles = await page.evaluate(() => ({
    sectionCopy: getComputedStyle(
      document.querySelector(".section-hero-copy") as Element,
    ).animationName,
    mascot: getComputedStyle(
      document.querySelector(".section-hero-mascot") as Element,
    ).animationName,
    scrollReveal: getComputedStyle(
      document.querySelector(".section-main > .contact-layout") as Element,
    ).animationName,
    sectionLinkTransition: getComputedStyle(
      document.querySelector(".contact-card form button") as Element,
    ).transitionProperty,
  }));
  expect(reducedSectionStyles).toEqual({
    sectionCopy: "none",
    mascot: "none",
    scrollReveal: "none",
    sectionLinkTransition: "none",
  });
});
