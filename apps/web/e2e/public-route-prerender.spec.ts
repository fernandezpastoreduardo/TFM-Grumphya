import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const publicRoutes = JSON.parse(
  readFileSync(
    new URL("../src/shared/prerendered-public-routes.json", import.meta.url),
    "utf8",
  ),
) as Array<{ path: string; seo: { title: string; description: string } }>;

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
    heading: "Ficha pública de revisión interna",
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

test("publishes route-specific canonical and social metadata", async ({
  request,
}) => {
  const imageUrl =
    "https://grumphya.com/assets/grumphya/home-grumpy-judge.webp";
  for (const route of publicRoutes) {
    const html = await (await request.get(route.path)).text();
    const canonicalUrl = `https://grumphya.com${route.path}`;
    expect(html.match(/rel="canonical"/g), route.path).toHaveLength(1);
    expect(html).toContain(`<link rel="canonical" href="${canonicalUrl}"`);
    expect(html).toContain(`<title>${route.seo.title}</title>`);
    expect(html).toContain(
      `<meta name="description" content="${route.seo.description}"`,
    );
    expect(html).toContain(`<meta property="og:url" content="${canonicalUrl}"`);
    expect(html).toContain(
      `<meta property="og:title" content="${route.seo.title}"`,
    );
    expect(html).toContain(`<meta property="og:image" content="${imageUrl}"`);
    expect(html).toContain('<meta property="og:type" content="website"');
    expect(html).toContain('<meta name="twitter:card" content="summary"');
  }
  expect(
    (await request.get("/assets/grumphya/home-grumpy-judge.webp")).ok(),
  ).toBe(true);

  const queriedHtml = await (
    await request.get("/precios?utm_source=synthetic-test")
  ).text();
  expect(queriedHtml).toContain(
    '<link rel="canonical" href="https://grumphya.com/precios"',
  );
  expect(queriedHtml).toContain(
    '<meta property="og:url" content="https://grumphya.com/precios"',
  );
  expect(queriedHtml).not.toContain("utm_source=synthetic-test");
});

test("prerenders the roast conversation skeleton before client hydration", async ({
  request,
}) => {
  const response = await request.get("/descargate");
  const html = await response.text();

  expect(html).toContain('class="loading-skeleton-content"');
  expect(html).toContain("skeleton-roast-bubble user");
  expect(html).toContain("skeleton-roast-bubble reply");
});

test("keeps the mobile contact mascot lazy-loaded in the prerendered document", async ({
  request,
}) => {
  const response = await request.get("/contacto");
  const html = await response.text();

  expect(response.ok()).toBe(true);
  expect(html).toContain(
    '<img class="section-mobile-mascot-image" src="/assets/grumphya/contact-hero-phone.svg" alt="" aria-hidden="true" loading="lazy" decoding="async"/>',
  );
  expect(html).not.toContain(
    '<link rel="preload" as="image" href="/assets/grumphya/contact-hero-phone.svg"',
  );
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
  expect(html).not.toContain('rel="canonical"');
  expect(html).not.toContain('property="og:url"');
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
