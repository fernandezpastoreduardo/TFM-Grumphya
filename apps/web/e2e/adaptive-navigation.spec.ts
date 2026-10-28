import { expect, test } from "@playwright/test";

const WIDE_DESKTOP = { width: 1600, height: 1000 };
const NARROW_DESKTOP = { width: 980, height: 1000 };
const VISIBLE_MENU_ICON_STROKE = "rgb(18, 56, 61)";

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
  await expect(header).toHaveClass(/navigation-overflow/);
  await expect(menuTrigger).toBeVisible();
  await expect(menuIconPath).toHaveCSS("stroke", VISIBLE_MENU_ICON_STROKE);

  await page.setViewportSize(NARROW_DESKTOP);
  await expect(header).toHaveClass(/navigation-overflow/);
  await expect(menuTrigger).toBeVisible();
  await expect(menuIconPath).toHaveCSS("stroke", VISIBLE_MENU_ICON_STROKE);
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
