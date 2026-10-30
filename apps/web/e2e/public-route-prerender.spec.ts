import { expect, test } from "@playwright/test";

const PRICING_ROUTE = "/precios";
const PRICING_HERO = "Once usos. Sí, once.";
const PUBLIC_PRERENDERED_PAGES = [
  { path: "/", heading: "Antes de construirla," },
  { path: "/lo-peor-de-lo-peor", heading: "El muro de la vergüenza" },
  { path: "/descargate", heading: "Descárgate a gusto" },
  { path: "/humanos-notables", heading: "Humanos notables" },
  { path: "/buenas-practicas", heading: "Primero el problema." },
  { path: "/contacto", heading: "¿Necesitas decirlo en voz alta?" },
  { path: "/politica-de-privacidad", heading: "Política de privacidad" },
  { path: "/terminos-y-condiciones", heading: "Términos y condiciones" },
  {
    path: "/acreditaciones/DS-GRUMPHYA-2026-001",
    heading: "Ficha pública de verificación",
  },
] as const;

test("serves all public section content in its initial HTML", async ({
  request,
}) => {
  for (const { path, heading } of PUBLIC_PRERENDERED_PAGES) {
    const response = await request.get(path);
    expect(response.ok(), `${path} should return a successful response`).toBe(
      true,
    );
    expect(
      await response.text(),
      `${path} should include its page heading`,
    ).toContain(heading);
  }
});

test("prerenders the roast conversation skeleton to reserve its initial height", async ({
  request,
}) => {
  const response = await request.get("/descargate");
  const html = await response.text();

  expect(html).toContain('class="loading-skeleton-content"');
  expect(html).toContain("skeleton-roast-bubble user");
  expect(html).toContain("skeleton-roast-bubble reply");
});

test("hydrates every prerendered public route", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("grumphya-theme", "dark");
  });

  for (const { path, heading } of PUBLIC_PRERENDERED_PAGES) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
    await expect(page.locator(".home-page, .app-page")).toHaveClass(
      /theme-dark/,
    );
    await page.waitForLoadState("networkidle");
    await page.getByRole("switch").click();
    await expect(page.locator(".home-page, .app-page")).toHaveClass(
      /theme-light/,
    );
    await page.evaluate(() => {
      window.localStorage.setItem("grumphya-theme", "dark");
    });
  }
});

test("keeps session routes on the empty SPA shell", async ({ request }) => {
  const response = await request.get("/perfil");
  const html = await response.text();

  expect(response.ok()).toBe(true);
  expect(html).toContain('<div id="root"></div>');
  expect(html).not.toContain("Antes de construirla,");
});

test("serves the pricing page content in the initial HTML and hydrates it", async ({
  page,
  request,
}) => {
  const response = await request.get(PRICING_ROUTE);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain(PRICING_HERO);

  await page.goto(PRICING_ROUTE);
  await expect(page.getByRole("heading", { name: PRICING_HERO })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Elegir Iluminado/ }),
  ).toBeEnabled();
});
