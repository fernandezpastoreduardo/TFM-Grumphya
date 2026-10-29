import { expect, test } from "@playwright/test";

const WIDE_DESKTOP = { width: 1600, height: 1000 };
const NARROW_DESKTOP = { width: 980, height: 1000 };
const VISIBLE_MENU_ICON_STROKE = "rgb(18, 56, 61)";

function getAccountProfile(role: "user" | "admin") {
  return {
    user: {
      role,
      email: "persona@example.es",
      username: "PersonaE2E",
      emailVerified: true,
      createdAt: "2026-10-29T12:00:00.000Z",
      publicRankingsOptIn: false,
    },
    plans: ["ILUMINADO", "FALTON"].map((plan) => ({
      plan,
      status: "inactive",
      startsAt: null,
      expiresAt: null,
      attemptsRemaining: { ideas: 0, roasts: 0 },
    })),
  };
}

test("switches Home navigation when desktop content no longer fits after resizing", async ({
  page,
}) => {
  await page.setViewportSize(WIDE_DESKTOP);
  await page.goto("/");

  const topbar = page.locator(".home-topbar");
  const menuTrigger = page.locator(
    ".home-topbar .home-mobile-menu .mobile-menu-trigger",
  );
  const menuIconPath = menuTrigger.locator(".menu-icon-open svg path").first();
  await expect(topbar).not.toHaveClass(/navigation-overflow/);
  await expect(menuTrigger).toBeHidden();

  await page.setViewportSize(NARROW_DESKTOP);
  await page
    .locator(".home-nav-link")
    .nth(1)
    .evaluate((link) => {
      link.textContent = `${link.textContent} con muchas más palabras para probar el ancho`;
    });
  await expect(topbar).toHaveClass(/navigation-overflow/);
  await expect(menuTrigger).toBeVisible();
  await expect(menuIconPath).toHaveCSS("stroke", VISIBLE_MENU_ICON_STROKE);

  await page
    .locator(".home-nav-link")
    .nth(1)
    .evaluate((link) => {
      link.textContent = "Peores ideas";
    });
  await expect(topbar).not.toHaveClass(/navigation-overflow/);
  await expect(menuTrigger).toBeHidden();

  await page.setViewportSize(WIDE_DESKTOP);
  await expect(topbar).not.toHaveClass(/navigation-overflow/);
});

test("switches section navigation when desktop content no longer fits after resizing", async ({
  page,
}) => {
  await page.setViewportSize(WIDE_DESKTOP);
  await page.goto("/precios");

  const header = page.locator(".site-header");
  const menuTrigger = page.locator(
    ".site-header .site-mobile-menu .mobile-menu-trigger",
  );
  const menuIconPath = menuTrigger.locator(".menu-icon-open svg path").first();
  await expect(header).not.toHaveClass(/navigation-overflow/);
  await expect(menuTrigger).toBeHidden();

  await page.setViewportSize(NARROW_DESKTOP);
  await expect(header).toHaveClass(/navigation-overflow/);
  await expect(menuTrigger).toBeVisible();
  await expect(menuIconPath).toHaveCSS("stroke", VISIBLE_MENU_ICON_STROKE);
  await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(header).toHaveCSS("background-image", /linear-gradient/);
  await menuTrigger.click();
  await expect(menuTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("dialog", { name: "Menú de navegación" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Secciones principales" }).last(),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(menuTrigger).toHaveAttribute("aria-expanded", "false");
});

test("keeps signed-in actions to the left of the theme switch during desktop overflow", async ({
  page,
}) => {
  await page.setViewportSize(NARROW_DESKTOP);

  let role: "user" | "admin" = "user";
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accessToken: "e2e-overflow-session" }),
    }),
  );
  await page.route("**/api/account/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(getAccountProfile(role)),
    }),
  );
  await page.route("**/api/account/good-ideas", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ideas: [] }),
    }),
  );
  await page.route("**/api/admin/dashboard", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/admin/contact-messages", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );

  for (const pagePath of ["/perfil", "/panel-control"]) {
    role = pagePath === "/panel-control" ? "admin" : "user";
    await page.goto(pagePath);

    const header = page.locator(".site-header");
    await expect(header).toHaveClass(/navigation-overflow/);
    await expect(
      header.locator(":scope > .account-actions-site"),
    ).toBeVisible();
    await expect(header.locator(":scope > .site-theme-toggle")).toBeVisible();

    const actionLayout = await page.evaluate(() => {
      const actions = document.querySelector(
        ".site-header > .account-actions-site",
      );
      const themeToggle = document.querySelector(
        ".site-header > .site-theme-toggle",
      );
      if (!actions || !themeToggle) return null;
      const actionsBox = actions.getBoundingClientRect();
      const themeBox = themeToggle.getBoundingClientRect();
      return {
        sameRow:
          Math.abs(
            actionsBox.top +
              actionsBox.height / 2 -
              (themeBox.top + themeBox.height / 2),
          ) < 2,
        beforeTheme: actionsBox.right < themeBox.left,
      };
    });
    expect(actionLayout).toEqual({ sameRow: true, beforeTheme: true });
  }
});
