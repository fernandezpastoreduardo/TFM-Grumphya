import { expect, test } from "@playwright/test";
import { mockDevelopmentSecurityBadge } from "./support/mock-development-security-badge";

const VERIFICATION_URL = "/acreditaciones/DS-GRUMPHYA-2026-001";
const EXTERNAL_SITE_URL = "https://desarrolloseguro.org/";
const LEGACY_PROTOTYPE_URL = "/desarrollo-seguro";
const BADGE_SELECTOR = "a[data-ds-verified-badge]";
const BADGE_NAME = /sello verificado por desarrolloseguro\.org/i;
const ACADEMIC_RECORD = {
  id: "DS-GRUMPHYA-2026-001",
  issuer: "Grumphya · revisión interna",
  application: "Grumphya",
  authorizedDomains: ["grumphya.com"],
  status: "demonstration",
  issuedAt: "2026-10-28T09:38:54.000Z",
  validatedAt: "2026-10-28T10:45:48.000Z",
  validationMethod: "Revisión técnica interna de código y pruebas",
  expiresAt: null,
  scope: "Prototipo académico de Grumphya",
  criteria: ["Áreas propuestas para evaluación"],
  assurances: [
    {
      id: "privacy",
      title: "Privacidad orientada al RGPD",
      description: "Controles de datos documentados.",
      evidence: "Código y pruebas internas.",
      limitation: "Revisión jurídica pendiente.",
    },
  ],
  disclaimer:
    "Demostración académica, sin certificación oficial ni auditoría independiente.",
};

test("loads the verified badge and keeps the local verification record", async ({
  page,
}) => {
  await mockDevelopmentSecurityBadge(page);
  await page.route("**/api/accreditations/**", (route) =>
    route.fulfill({ json: ACADEMIC_RECORD }),
  );
  await page.goto("/");

  const link = page.getByRole("link", { name: BADGE_NAME });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", EXTERNAL_SITE_URL);
  await expect(link).toHaveAttribute(
    "data-hostname",
    new URL(page.url()).hostname,
  );

  await page.goto(VERIFICATION_URL);
  await expect(
    page.getByRole("heading", { name: "Ficha pública de revisión interna" }),
  ).toBeVisible();
  await expect(page.getByText("grumphya.com")).toBeVisible();
  await expect(page.getByText("Privacidad orientada al RGPD")).toBeVisible();
  await expect(
    page.getByText(/sin certificación oficial ni auditoría independiente/i),
  ).toBeVisible();
});

test("keeps the seal and verification within mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockDevelopmentSecurityBadge(page);
  await page.route("**/api/accreditations/**", (route) =>
    route.fulfill({ json: ACADEMIC_RECORD }),
  );
  await page.goto("/precios");
  const link = page.locator(BADGE_SELECTOR);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", EXTERNAL_SITE_URL);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("keeps verification text readable on dark backgrounds in dark mode", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("grumphya-theme", "dark");
  });
  await page.route("**/api/accreditations/**", (route) =>
    route.fulfill({ json: ACADEMIC_RECORD }),
  );
  await page.goto(VERIFICATION_URL);

  const verificationCard = page.locator(".accreditation-verification");
  const assuranceCard = page.locator(".accreditation-assurance");
  await expect(page.locator(".app-page")).toHaveClass(/theme-dark/);
  await expect(verificationCard).toHaveCSS(
    "background-color",
    "rgb(32, 60, 59)",
  );
  await expect(verificationCard).toHaveCSS("color", "rgb(243, 255, 243)");
  await expect(assuranceCard).toHaveCSS("background-color", "rgb(49, 92, 86)");
  await expect(assuranceCard).toHaveCSS("color", "rgb(243, 255, 243)");
});

test("redirects old prototype URLs to the independent domain", async ({
  request,
}) => {
  for (const path of [
    LEGACY_PROTOTYPE_URL,
    `${LEGACY_PROTOTYPE_URL}/`,
    `${LEGACY_PROTOTYPE_URL}/no-existe`,
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe(EXTERNAL_SITE_URL);
  }
});
