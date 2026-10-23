import { expect, test, type Page } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1200, height: 1000 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
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
  {
    path: "/descargate",
    mascotClass: "mascot-roast",
    asset: "/assets/grumphya/descargate-boxing-bag.png",
  },
  {
    path: "/panel-control",
    mascotClass: "mascot-admin",
    asset: "/assets/grumphya/admin-dashboard-audit.png",
    role: "admin",
  },
] as const;

async function assetHasTransparentPixels(page: Page, assetPath: string) {
  return page.evaluate(async (path) => {
    const image = new Image();
    image.src = path;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let alphaIndex = 3; alphaIndex < pixels.length; alphaIndex += 4) {
      if (pixels[alphaIndex] < 255) return true;
    }
    return false;
  }, assetPath);
}

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
    workspaceMarginTop: "12px",
    copyPaddingTop: "0px",
    copyGap: "20px",
    resultMarginTop: "40px",
    marketingMarginTop: "40px",
    footerMarginTop: "40px",
  });

  const homeHero = await page
    .locator(".home-hero-layout > .home-hero-stage .home-creature")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        backgroundSize: style.backgroundSize,
        backgroundPosition: style.backgroundPosition,
      };
    });
  expect(homeHero.backgroundImage).toContain(
    "/assets/grumphya/home-grumpy-judge.png",
  );
  expect(homeHero.backgroundSize).toBe("contain");
  expect(homeHero.backgroundPosition).toBe("50% 100%");
  const homeStage = page.locator(".home-hero-layout > .home-hero-stage");
  const homeMascotBox = await page
    .locator(".home-hero-layout > .home-hero-stage .home-creature")
    .boundingBox();
  const homeStageBox = await homeStage.boundingBox();
  expect(homeMascotBox).not.toBeNull();
  expect(homeStageBox).not.toBeNull();
  expect(homeMascotBox!.width / homeStageBox!.width).toBeGreaterThan(0.8);
  const homeAssetPath = "/assets/grumphya/home-grumpy-judge.png";
  const homeAssetResponse = await page.request.get(homeAssetPath);
  expect(homeAssetResponse.ok()).toBe(true);
  expect(homeAssetResponse.headers()["content-type"]).toContain("image/png");
  expect(await assetHasTransparentPixels(page, homeAssetPath)).toBe(true);

  const toneIllustrations = [
    {
      selector: ".idea-tone-illustration-soft",
      asset: "/assets/grumphya/idea-tone-soft-bandage-v2.png",
    },
    {
      selector: ".idea-tone-illustration-hard",
      asset: "/assets/grumphya/idea-tone-hard-boxing-v2.png",
    },
  ] as const;
  await page
    .getByRole("textbox", { name: /escribe, pega o dicta tu idea/i })
    .fill("Una app para compartir herramientas entre vecinos");
  await page.getByRole("button", { name: /adelante/i }).click();
  for (const illustration of toneIllustrations) {
    const renderedBackground = await page
      .locator(illustration.selector)
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(renderedBackground).toContain(illustration.asset);
    const response = await page.request.get(illustration.asset);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(await assetHasTransparentPixels(page, illustration.asset)).toBe(
      true,
    );
  }
});

test("aligns login content and keeps Good Practices editorial content in flow", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto("/login");
  await expect(
    page.getByRole("heading", {
      name: "Aquí solo evaluamos ideas, no contraseñas.",
    }),
  ).toBeVisible();

  const loginAlignment = await page
    .locator(".authentication-layout")
    .evaluate((element) => getComputedStyle(element).alignItems);
  expect(loginAlignment).toBe("start");
  await expect(
    page.getByRole("heading", { name: "Tu historial no es público." }),
  ).toBeVisible();

  await page.goto("/buenas-practicas");
  await expect(
    page.getByRole("heading", {
      name: "Prototipar rápido está bien. Validar antes está mejor.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/contenido editorial en revisión/i)).toHaveCount(
    0,
  );
  const introPosition = await page
    .locator(".practices-intro")
    .evaluate((element) => getComputedStyle(element).position);
  expect(introPosition).toBe("static");

  const mascotPath = "/assets/grumphya/good-practices-validate-idea.png";
  await expect(page.locator(".calm-mascot")).toHaveAttribute("src", mascotPath);
  const mascotResponse = await page.request.get(mascotPath);
  expect(mascotResponse.ok()).toBe(true);
  expect(mascotResponse.headers()["content-type"]).toContain("image/png");
  expect(await assetHasTransparentPixels(page, mascotPath)).toBe(true);

  const companionAssets = [
    {
      selector: ".practice-companion-pink",
      asset: "/assets/grumphya/good-practices-companion-pink.png",
    },
    {
      selector: ".practice-companion-yellow",
      asset: "/assets/grumphya/good-practices-companion-yellow.png",
    },
  ] as const;
  for (const companion of companionAssets) {
    const background = await page
      .locator(companion.selector)
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(background).toContain(companion.asset);
    const response = await page.request.get(companion.asset);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(await assetHasTransparentPixels(page, companion.asset)).toBe(true);
  }
});

test("keeps the password visibility control usable on a mobile login", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto("/login");

  const password = page.getByLabel("Contraseña", { exact: true });
  const revealButton = page.getByRole("button", {
    name: "Mostrar contraseña",
  });
  await expect(password).toHaveAttribute("type", "password");
  await expect(revealButton).toBeVisible();

  const controlBounds = await page
    .locator(".authentication-password-field")
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right };
    });
  expect(controlBounds.left).toBeGreaterThanOrEqual(0);
  expect(controlBounds.right).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);

  await revealButton.focus();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await expect(
    page.getByRole("button", { name: "Ocultar contraseña" }),
  ).toBeVisible();
});

test("keeps the Home navigation opaque and above the idea form in both themes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /antes de construirla/i }),
  ).toBeVisible();

  const readNavigationLayers = () =>
    page.evaluate(() => {
      const home = document.querySelector(".home-page");
      const navigation = document.querySelector(".home-topbar");
      const ideaWorkspace = document.querySelector(".home-workspace");
      if (!home || !navigation || !ideaWorkspace) return null;
      const themeBackgroundProbe = document.createElement("div");
      themeBackgroundProbe.style.backgroundColor = getComputedStyle(home)
        .getPropertyValue("--color-mint")
        .trim();
      document.body.append(themeBackgroundProbe);
      const pageThemeBackground =
        getComputedStyle(themeBackgroundProbe).backgroundColor;
      themeBackgroundProbe.remove();
      return {
        pageThemeBackground,
        isDarkTheme: home.classList.contains("theme-dark"),
        navigationBackground: getComputedStyle(navigation).backgroundColor,
        navigationZIndex: Number.parseInt(
          getComputedStyle(navigation).zIndex,
          10,
        ),
        ideaWorkspaceZIndex: Number.parseInt(
          getComputedStyle(ideaWorkspace).zIndex,
          10,
        ),
        curtainZIndex: Number.parseInt(
          getComputedStyle(home, "::before").zIndex,
          10,
        ),
        audienceZIndex: Number.parseInt(
          getComputedStyle(home, "::after").zIndex,
          10,
        ),
        characterCounterPosition: getComputedStyle(
          document.querySelector(".idea-input-meta")!,
        ).position,
      };
    });

  const lightThemeLayers = await readNavigationLayers();
  expect(lightThemeLayers).not.toBeNull();
  expect(lightThemeLayers!.isDarkTheme).toBe(false);
  expect(lightThemeLayers!.navigationBackground).toBe(
    lightThemeLayers!.pageThemeBackground,
  );
  expect(lightThemeLayers!.navigationZIndex).toBeGreaterThan(
    lightThemeLayers!.ideaWorkspaceZIndex,
  );
  expect(lightThemeLayers!.curtainZIndex).toBe(
    lightThemeLayers!.audienceZIndex,
  );
  expect(lightThemeLayers!.characterCounterPosition).toBe("static");

  await page.getByRole("switch", { name: "Activar modo oscuro" }).click();
  const darkThemeLayers = await readNavigationLayers();
  expect(darkThemeLayers).not.toBeNull();
  expect(darkThemeLayers!.isDarkTheme).toBe(true);
  expect(darkThemeLayers!.navigationBackground).toBe(
    darkThemeLayers!.pageThemeBackground,
  );
  expect(darkThemeLayers!.navigationZIndex).toBeGreaterThan(
    darkThemeLayers!.ideaWorkspaceZIndex,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCharacterCounterPosition = await page
    .locator(".idea-input-meta")
    .evaluate((element) => getComputedStyle(element).position);
  const mobileNavigationTop = await page
    .locator(".home-topbar")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).top));
  expect(mobileCharacterCounterPosition).toBe("absolute");
  expect(mobileNavigationTop).toBeLessThan(35);
});

test("matches section navigation to the theme and layers curtain over content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/precios");
  await expect(page.getByRole("heading", { name: /once usos/i })).toBeVisible();

  const readSectionLayers = () =>
    page.evaluate(() => {
      const appPage = document.querySelector(".app-page");
      const header = document.querySelector(".site-header");
      const contentFrame = document.querySelector(".app-frame");
      if (!appPage || !header || !contentFrame) return null;
      const themeColor = document.createElement("div");
      themeColor.style.backgroundColor = getComputedStyle(appPage)
        .getPropertyValue("--color-mint")
        .trim();
      document.body.append(themeColor);
      const normalizedThemeColor = getComputedStyle(themeColor).backgroundColor;
      themeColor.remove();
      return {
        isDarkTheme: appPage.classList.contains("theme-dark"),
        headerBackground: getComputedStyle(header).backgroundColor,
        themeBackground: normalizedThemeColor,
        curtainZIndex: Number.parseInt(
          getComputedStyle(appPage, "::before").zIndex,
          10,
        ),
        audienceZIndex: Number.parseInt(
          getComputedStyle(appPage, "::after").zIndex,
          10,
        ),
        contentZIndex: Number.parseInt(
          getComputedStyle(contentFrame).zIndex,
          10,
        ),
        headerTop: Number.parseFloat(getComputedStyle(header).top),
      };
    });

  const lightLayers = await readSectionLayers();
  expect(lightLayers).not.toBeNull();
  expect(lightLayers!.isDarkTheme).toBe(false);
  expect(lightLayers!.headerBackground).toBe(lightLayers!.themeBackground);
  expect(lightLayers!.curtainZIndex).toBe(lightLayers!.audienceZIndex);
  expect(lightLayers!.curtainZIndex).toBeGreaterThan(
    lightLayers!.contentZIndex,
  );
  expect(lightLayers!.headerTop).toBeLessThan(35);

  await page.getByRole("switch", { name: "Activar modo oscuro" }).click();
  const darkLayers = await readSectionLayers();
  expect(darkLayers).not.toBeNull();
  expect(darkLayers!.isDarkTheme).toBe(true);
  expect(darkLayers!.headerBackground).toBe(darkLayers!.themeBackground);
  expect(darkLayers!.curtainZIndex).toBe(darkLayers!.audienceZIndex);
});

test("styles the email request form shown for an expired password link", async ({
  page,
}) => {
  await page.goto("/restablecer-contrasena");
  await expect(
    page.getByRole("heading", { name: /recupera el acceso/i }),
  ).toBeVisible();

  const formStyles = await page.evaluate(() => {
    const form = document.querySelector(".password-reset-request-form");
    const input = form?.querySelector("input");
    const button = form?.querySelector("button");
    if (!form || !input || !button) return null;
    return {
      formGap: getComputedStyle(form).rowGap,
      inputHeight: input.getBoundingClientRect().height,
      inputBorderRadius: getComputedStyle(input).borderRadius,
      inputWidth: input.getBoundingClientRect().width,
      buttonHeight: button.getBoundingClientRect().height,
      buttonWidth: button.getBoundingClientRect().width,
    };
  });

  expect(formStyles).not.toBeNull();
  expect(formStyles!.formGap).toBe("16px");
  expect(formStyles!.inputHeight).toBeGreaterThanOrEqual(50);
  expect(formStyles!.inputBorderRadius).toBe("14px");
  expect(formStyles!.buttonHeight).toBeGreaterThanOrEqual(50);
  expect(formStyles!.buttonWidth).toBe(formStyles!.inputWidth);
});

test("uses Grumphya's navigation logo as the site favicon", async ({
  page,
}) => {
  await page.goto("/precios");
  const favicon = page.locator('link[rel="icon"]');
  await expect(favicon).toHaveAttribute(
    "href",
    "/assets/grumphya/mascot-isotype.svg",
  );
  const navigationLogo = await page
    .locator(".brand-mark")
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(navigationLogo).toContain("/assets/grumphya/mascot-isotype.svg");
  const response = await page.request.get(
    "/assets/grumphya/mascot-isotype.svg",
  );
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("Grumphya, cara del logotipo");
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
    if ("role" in hero && hero.role === "admin") {
      await page.addInitScript(() => {
        localStorage.setItem("grumphya-theme", "dark");
      });
      await page.route("**/api/auth/refresh", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ accessToken: "e2e-admin-token" }),
        }),
      );
      await page.route("**/api/account/profile", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ user: { role: "admin" }, plans: [] }),
        }),
      );
      await page.route("**/api/admin/dashboard", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            revenue: { weeklyEur: 0, totalEur: 0 },
            estimatedAiCost: {
              weeklyUsd: 0,
              totalUsd: 0,
              weeklyAveragePerAccountUsd: 0,
              totalAveragePerAccountUsd: 0,
              activeRegisteredAccountCount: 0,
              activeAdminAccountCount: 0,
              weeklyByActor: {
                registeredUsersUsd: 0,
                adminsUsd: 0,
                anonymousUsd: 0,
              },
              totalByActor: {
                registeredUsersUsd: 0,
                adminsUsd: 0,
                anonymousUsd: 0,
              },
              weeklyTrend: [],
              unpricedUsageEvents: 0,
            },
            errors: [
              {
                code: "INVALID_EVALUATION_RESPONSE",
                weeklyCount: 1,
                totalCount: 1,
                lastOccurredAt: "2026-10-21T18:30:00.000Z",
                latestDiagnosticCode: "decision_semantics",
              },
            ],
          }),
        }),
      );
      await page.route("**/api/admin/contact-messages", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ messages: [] }),
        }),
      );
    }
    await page.goto(hero.path);
    const mascot = page.locator(`.section-hero-mascot.${hero.mascotClass}`);
    await expect(mascot).toBeVisible();
    const backgroundImage = await mascot.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    expect(backgroundImage).toContain(hero.asset);
    const assetResponse = await page.request.get(hero.asset);
    expect(assetResponse.ok()).toBe(true);
    expect(assetResponse.headers()["content-type"]).toContain("image/png");

    const assetIsTransparent = await assetHasTransparentPixels(
      page,
      hero.asset,
    );

    expect(
      assetIsTransparent,
      `${hero.asset} should have transparent pixels`,
    ).toBe(true);

    if ("role" in hero && hero.role === "admin") {
      const dashboardTextColor = await page
        .locator(".admin-dashboard")
        .evaluate((element) => getComputedStyle(element).color);
      expect(dashboardTextColor).toBe("rgb(23, 33, 35)");

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(
        page.getByRole("columnheader", { name: "Diagnóstico reciente" }),
      ).toBeVisible();
      const dashboardOverflow = await page.evaluate(() => {
        const table = document.querySelector(".admin-table-scroll");
        if (!table) return null;
        return {
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          tableClientWidth: table.clientWidth,
          tableScrollWidth: table.scrollWidth,
          tableOverflow: getComputedStyle(table).overflowX,
        };
      });
      expect(dashboardOverflow).not.toBeNull();
      expect(dashboardOverflow!.documentWidth).toBeLessThanOrEqual(
        dashboardOverflow!.viewportWidth,
      );
      expect(dashboardOverflow!.tableScrollWidth).toBeGreaterThan(
        dashboardOverflow!.tableClientWidth,
      );
      expect(dashboardOverflow!.tableOverflow).toBe("auto");
    }
  }
});

test("stacks mobile mascots after page content and prevents iPhone input zoom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contacto");

  const sectionMascot = page.locator(".section-mobile-mascot");
  const sectionContent = page.locator(".section-main > .contact-layout");
  await expect(sectionMascot).toBeVisible();
  await expect(page.locator(".section-hero-mascot")).toBeHidden();
  const sectionMascotBox = await sectionMascot.boundingBox();
  const sectionContentBox = await sectionContent.boundingBox();
  expect(sectionMascotBox).not.toBeNull();
  expect(sectionContentBox).not.toBeNull();
  expect(sectionMascotBox!.y).toBeGreaterThanOrEqual(
    sectionContentBox!.y + sectionContentBox!.height,
  );

  const mobileInputSize = await page
    .locator(".contact-card input")
    .first()
    .evaluate((input) => getComputedStyle(input).fontSize);
  expect(mobileInputSize).toBe("16px");
  const curtainAndHeader = await page.evaluate(() => ({
    curtainHeight: Number.parseFloat(
      getComputedStyle(
        document.querySelector(".app-page") as Element,
        "::before",
      ).height,
    ),
    headerTop: document.querySelector(".site-header")!.getBoundingClientRect()
      .top,
    headerZIndex: Number.parseInt(
      getComputedStyle(document.querySelector(".site-header")!).zIndex,
      10,
    ),
    curtainZIndex: Number.parseInt(
      getComputedStyle(document.querySelector(".app-page")!, "::before").zIndex,
      10,
    ),
  }));
  expect(curtainAndHeader.headerTop).toBeLessThan(
    curtainAndHeader.curtainHeight,
  );
  expect(curtainAndHeader.curtainZIndex).toBeGreaterThan(
    curtainAndHeader.headerZIndex,
  );

  await page.goto("/");
  const mobileHeroHeading = page.locator(".home-heading-copy h1");
  const mobileHeroDescription = page.locator(".home-rude-line");
  await expect(mobileHeroHeading).toBeVisible();
  const ideaInputLabel = page.locator(".idea-input-label");
  await expect(ideaInputLabel).toBeVisible();
  const ideaInputLabelBox = await ideaInputLabel.boundingBox();
  expect(ideaInputLabelBox).not.toBeNull();
  expect(ideaInputLabelBox!.width).toBeGreaterThan(1);
  expect(
    await mobileHeroHeading.evaluate(
      (element) => getComputedStyle(element).textAlign,
    ),
  ).toBe("left");
  expect(
    await mobileHeroDescription.evaluate(
      (element) => getComputedStyle(element).textAlign,
    ),
  ).toBe("left");
  expect(
    await page
      .locator(".home-heading-copy")
      .evaluate((element) => getComputedStyle(element).paddingTop),
  ).toBe("10px");

  await page.getByRole("button", { name: "Abrir menú de secciones" }).click();
  const mobileMenu = page.getByRole("dialog", { name: "Menú de navegación" });
  await expect(
    mobileMenu.getByRole("link", { name: "Contacto" }),
  ).toBeVisible();
  await mobileMenu.getByRole("link", { name: "Contacto" }).click();
  await expect(page).toHaveURL(/\/contacto$/);

  await page.getByRole("button", { name: "Abrir menú de secciones" }).click();
  const sectionMenu = page.getByRole("dialog", { name: "Menú de navegación" });
  const plansLink = sectionMenu.getByRole("link", { name: "Planes" });
  await expect(plansLink).toBeVisible();
  await plansLink.click();
  await expect(page).toHaveURL(/\/precios$/);

  await page.goto("/");
  const homeMascot = page.locator(".home-hero-stage-mobile");
  const marketing = page.locator(".home-marketing");
  const footer = page.locator(".home-footer");
  await expect(homeMascot).toBeVisible();
  await expect(
    page.locator(".home-hero-layout > .home-hero-stage"),
  ).toBeHidden();
  const homeMascotBox = await homeMascot.boundingBox();
  const marketingBox = await marketing.boundingBox();
  const footerBox = await footer.boundingBox();
  expect(homeMascotBox).not.toBeNull();
  expect(marketingBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(homeMascotBox!.y).toBeGreaterThanOrEqual(
    marketingBox!.y + marketingBox!.height,
  );
  expect(homeMascotBox!.y + homeMascotBox!.height).toBeLessThanOrEqual(
    footerBox!.y,
  );

  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto("/");
  const continueButton = page.getByRole("button", { name: /^adelante$/i });
  const buttonBox = await continueButton.boundingBox();
  const actionsBox = await page.locator(".idea-step-actions").boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(
    Math.abs(
      buttonBox!.x +
        buttonBox!.width / 2 -
        (actionsBox!.x + actionsBox!.width / 2),
    ),
  ).toBeLessThanOrEqual(1);
});

test("serves the profile hero as a transparent PNG", async ({ page }) => {
  await page.goto("/login");
  const profileAsset = "/assets/grumphya/profile-account-shield.png";
  const response = await page.request.get(profileAsset);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect(await assetHasTransparentPixels(page, profileAsset)).toBe(true);
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
    "/assets/grumphya/contact-message-tube.png",
  );
  const contactIllustrationIsTransparent = await assetHasTransparentPixels(
    page,
    "/assets/grumphya/contact-message-tube.png",
  );
  expect(contactIllustrationIsTransparent).toBe(true);

  await page.evaluate(() => localStorage.setItem("grumphya-theme", "light"));
  await page.reload();
  const lightCardBackground = await contactCard.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(lightCardBackground).toBe("rgb(255, 255, 255)");

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
